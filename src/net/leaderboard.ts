// Pure weekly-board helpers in the validateSubmit style: queue helpers,
// Monday week-start, fetch/submit/flush with a forced-offline flag, and
// personal-best read/maybe-write. No DOM/three usage beyond the browser
// storage/navigator/fetch globals; never throws on corrupt input.

import { MAX_NAME_LENGTH, minDurationForWave } from './clamp';
import {
  anonHeaders,
  restRunsUrl,
  submitFunctionUrl,
} from './supabaseClient';
import { PB_STORAGE_KEY } from '../ui/store';

/** Offline queue localStorage key holding a JSON array of QueuedRun. */
export const QUEUE_STORAGE_KEY = 'take-light:queue';

/** Minimal submit payload queued while offline or paused. */
export interface QueuedRun {
  name: string;
  score: number;
  wave: number;
  duration_s: number;
}

/** Normalized weekly-board row rendered into #leaderboard. */
export interface LeaderboardRow {
  name: string;
  score: number;
  wave: number;
  duration_s: number;
  created_at: string;
}

/** Personal-best entry stored under PB_STORAGE_KEY. */
export interface PersonalBest {
  name: string;
  score: number;
  wave: number;
  kills: number;
  at: string;
}

/** submitRun outcome: ok sent, queued stored, rejected 4xx, failed retryable. */
export type SubmitStatus = 'ok' | 'queued' | 'rejected' | 'failed';

/** Discriminated submitRun result. */
export interface SubmitResult {
  status: SubmitStatus;
}

/** Injectable fetch for headless tests; defaults to the global fetch. */
export type FetchImpl = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

let forcedOffline = false;

/** True while window.__TAKELIGHT_OFFLINE__(true) is in effect. */
export function isForcedOffline(): boolean {
  return forcedOffline;
}

/** Flip the forced-offline flag; true short-circuits network calls. */
export function setForcedOffline(offline: boolean): void {
  forcedOffline = offline === true;
}

function isNavigatorOffline(): boolean {
  try {
    if (typeof navigator === 'undefined') {
      return false;
    }
    return navigator.onLine === false;
  } catch {
    return false;
  }
}

function queueStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage;
  } catch {
    return null;
  }
}

function isQueuedRun(value: unknown): value is QueuedRun {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['name'] === 'string' &&
    typeof record['score'] === 'number' &&
    typeof record['wave'] === 'number' &&
    typeof record['duration_s'] === 'number'
  );
}

function normalizedWave(wave: number): number {
  if (!Number.isFinite(wave)) {
    return 1;
  }
  return Math.max(1, Math.floor(wave));
}

/**
 * Normalize a queued run: trimmed 40-char name, floored score/wave, and
 * duration_s floored to the wave plausibility floor so the shared clamp
 * table answers 201 instead of 422 IMPLAUSIBLE_DURATION.
 */
export function normalizeQueuedRun(entry: QueuedRun): QueuedRun {
  const wave = normalizedWave(entry.wave);
  const score =
    Number.isFinite(entry.score) && entry.score > 0
      ? Math.floor(entry.score)
      : 0;
  const rawDuration =
    Number.isFinite(entry.duration_s) && entry.duration_s > 0
      ? Math.floor(entry.duration_s)
      : 0;
  const name =
    typeof entry.name === 'string'
      ? entry.name.trim().slice(0, MAX_NAME_LENGTH)
      : '';
  return {
    name,
    score,
    wave,
    duration_s: Math.max(rawDuration, minDurationForWave(wave)),
  };
}

/** Corruption-tolerant read: unparseable or non-array storage reads empty. */
export function loadQueue(): QueuedRun[] {
  const storage = queueStorage();
  if (storage === null) {
    return [];
  }
  let raw: string | null = null;
  try {
    raw = storage.getItem(QUEUE_STORAGE_KEY);
  } catch {
    return [];
  }
  if (raw === null || raw.length === 0) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isQueuedRun);
  } catch {
    return [];
  }
}

/** Persist the queue; the next write after corruption rewrites clean. */
export function saveQueue(queue: QueuedRun[]): void {
  const storage = queueStorage();
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full/blocked: the in-memory entry is dropped, never throws.
  }
}

/** Append a normalized run and persist; returns the stored queue. */
export function enqueueRun(entry: QueuedRun): QueuedRun[] {
  const queue = loadQueue();
  queue.push(normalizeQueuedRun(entry));
  saveQueue(queue);
  return queue;
}

/** Head of the queue without removing it, or null when empty. */
export function peekQueue(): QueuedRun | null {
  const queue = loadQueue();
  return queue.length > 0 ? (queue[0] as QueuedRun) : null;
}

/** Drop the head of the queue and persist. */
export function removeFirst(): void {
  const queue = loadQueue();
  if (queue.length === 0) {
    return;
  }
  queue.shift();
  saveQueue(queue);
}

/**
 * Monday 00:00:00 UTC ISO instant for the week containing now; Sunday maps
 * back six days so the weekly board always starts on Monday.
 */
export function weekStartISO(now: Date = new Date()): string {
  const cursor = new Date(now.getTime());
  const daysSinceMonday = (cursor.getUTCDay() + 6) % 7;
  const mondayMs = Date.UTC(
    cursor.getUTCFullYear(),
    cursor.getUTCMonth(),
    cursor.getUTCDate() - daysSinceMonday,
  );
  return new Date(mondayMs).toISOString();
}

/** Weekly top-100 PostgREST params: select/order/limit/gte week_start. */
export function buildWeeklyRunsParams(now: Date = new Date()): string {
  return (
    'select=name,score,wave,duration_s,created_at' +
    '&order=score.desc' +
    '&limit=100' +
    `&created_at=gte.${weekStartISO(now)}`
  );
}

/** Weekly top-100 read URL with same-origin fallback when env is absent. */
export function buildWeeklyRunsUrl(now?: Date): string {
  return restRunsUrl(buildWeeklyRunsParams(now ?? new Date()));
}

function normalizeRow(item: unknown): LeaderboardRow | null {
  if (typeof item !== 'object' || item === null) {
    return null;
  }
  const record = item as Record<string, unknown>;
  const name = record['name'];
  if (typeof name !== 'string' || name.length === 0) {
    return null;
  }
  const rawScore = record['score'];
  const score =
    typeof rawScore === 'number' && Number.isFinite(rawScore)
      ? Math.floor(rawScore)
      : 0;
  const rawWave = record['wave'];
  const wave =
    typeof rawWave === 'number' && Number.isFinite(rawWave)
      ? Math.max(1, Math.floor(rawWave))
      : 1;
  const rawDuration = record['duration_s'];
  const duration_s =
    typeof rawDuration === 'number' && Number.isFinite(rawDuration)
      ? Math.floor(rawDuration)
      : 0;
  const rawCreated = record['created_at'];
  const created_at = typeof rawCreated === 'string' ? rawCreated : '';
  return { name, score, wave, duration_s, created_at };
}

function readHeaders(): Record<string, string> {
  try {
    const headers = anonHeaders();
    if (headers['apikey'] !== undefined) {
      return headers;
    }
  } catch {
    // Fall through to the headerless same-origin read below.
  }
  // Same-origin stub read: Accept stays CORS-safelisted so no preflight
  // can fail the weekly fetch when no env is configured.
  return { Accept: 'application/json' };
}

/**
 * Fetch this week's top 100 normalized rows, capped to 100 regardless of
 * server count. Returns [] on forced offline, navigator offline, non-2xx,
 * or any fetch/parse failure; never throws.
 */
export async function fetchWeeklyTop100(
  fetchImpl: FetchImpl = globalThis.fetch,
  now?: Date,
): Promise<LeaderboardRow[]> {
  try {
    if (isForcedOffline() || isNavigatorOffline()) {
      return [];
    }
    const response = await fetchImpl(buildWeeklyRunsUrl(now), {
      headers: readHeaders(),
    });
    if (!response.ok) {
      return [];
    }
    const parsed: unknown = await response.json();
    if (!Array.isArray(parsed)) {
      return [];
    }
    const rows: LeaderboardRow[] = [];
    for (const item of parsed.slice(0, 100)) {
      const row = normalizeRow(item);
      if (row !== null) {
        rows.push(row);
      }
    }
    return rows;
  } catch {
    return [];
  }
}

type PostOutcome = 'ok' | 'rejected' | 'failed';

/** Raw POST with no queue side effects; flushQueue owns removal. */
async function postRun(
  entry: QueuedRun,
  fetchImpl: FetchImpl,
): Promise<PostOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(submitFunctionUrl(), {
      method: 'POST',
      headers: anonHeaders(),
      body: JSON.stringify(normalizeQueuedRun(entry)),
    });
  } catch {
    return 'failed';
  }
  if (response.ok) {
    return 'ok';
  }
  if (response.status >= 400 && response.status < 500) {
    return 'rejected';
  }
  return 'failed';
}

/**
 * Submit one run via the Edge Function. Forced/navigator offline stores
 * the entry synchronously and returns queued without calling fetch;
 * network errors and 5xx return failed so the caller can queue; 4xx is
 * definitive and returns rejected without storing.
 */
export async function submitRun(
  entry: QueuedRun,
  fetchImpl: FetchImpl = globalThis.fetch,
): Promise<SubmitResult> {
  if (isForcedOffline() || isNavigatorOffline()) {
    enqueueRun(entry);
    return { status: 'queued' };
  }
  const outcome = await postRun(entry, fetchImpl);
  if (outcome === 'ok') {
    return { status: 'ok' };
  }
  if (outcome === 'rejected') {
    return { status: 'rejected' };
  }
  return { status: 'failed' };
}

/**
 * Drain the queue in order: 2xx and definitive 4xx entries are removed
 * (a 4xx never succeeds on retry and must not wedge the queue); network
 * errors and 5xx stop the flush keeping the entry. Returns the remaining
 * queue length.
 */
export async function flushQueue(
  fetchImpl: FetchImpl = globalThis.fetch,
): Promise<number> {
  for (;;) {
    if (isForcedOffline() || isNavigatorOffline()) {
      return loadQueue().length;
    }
    const next = peekQueue();
    if (next === null) {
      return 0;
    }
    const outcome = await postRun(next, fetchImpl);
    if (outcome === 'ok' || outcome === 'rejected') {
      removeFirst();
      continue;
    }
    return loadQueue().length;
  }
}

/**
 * Run duration in whole seconds floored to the wave plausibility floor,
 * so seconds-long probe runs still satisfy the shared clamp table.
 */
export function computeDurationS(
  runStartAtMs: number,
  gameOverAtMs: number,
  wave: number,
): number {
  const elapsedS =
    Number.isFinite(runStartAtMs) && Number.isFinite(gameOverAtMs)
      ? Math.floor(Math.max(0, gameOverAtMs - runStartAtMs) / 1000)
      : 0;
  return Math.max(elapsedS, minDurationForWave(wave));
}

function isPersonalBest(value: unknown): value is PersonalBest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['name'] === 'string' &&
    typeof record['score'] === 'number' &&
    typeof record['wave'] === 'number' &&
    typeof record['kills'] === 'number' &&
    typeof record['at'] === 'string'
  );
}

/** Read the stored personal best, or null when absent or corrupt. */
export function readPb(): PersonalBest | null {
  const storage = queueStorage();
  if (storage === null) {
    return null;
  }
  try {
    const raw = storage.getItem(PB_STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isPersonalBest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Store the personal best only when the score exceeds the stored one.
 * Returns true when the entry was written.
 */
export function maybeWritePb(entry: PersonalBest): boolean {
  const storage = queueStorage();
  if (storage === null) {
    return false;
  }
  try {
    const current = readPb();
    if (current !== null && entry.score <= current.score) {
      return false;
    }
    storage.setItem(PB_STORAGE_KEY, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

/** #pb text: the best (or a no-best placeholder) plus (queued) when set. */
export function pbDisplayText(): string {
  const best = readPb();
  const suffix = loadQueue().length > 0 ? ' (queued)' : '';
  if (best === null) {
    return `No personal best yet${suffix}`;
  }
  return `Best: ${best.name} — ${best.score} pts · Wave ${best.wave}${suffix}`;
}
