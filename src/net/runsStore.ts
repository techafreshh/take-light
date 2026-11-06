// Shared in-memory runs table backing both local stubs: the weekly GET
// returns stored rows sorted score-desc capped at 100, the submit POST
// persists validated rows here before synthesizing its 201 body. Module
// state only — no DOM, no fetch, no three.js, safe for headless vitest.

/** Leaderboard-shaped stored row (mirrors normalizeRow in leaderboard). */
export interface StoredRun {
  name: string;
  score: number;
  wave: number;
  duration_s: number;
  created_at: string;
}

let rows: StoredRun[] = [];

/** Append a row and keep the table sorted score-desc. */
export function addRun(row: StoredRun): StoredRun {
  const stored: StoredRun = { ...row };
  rows.push(stored);
  rows.sort((a, b) => b.score - a.score);
  return stored;
}

/** Top 100 stored rows, score-desc, as copies. */
export function listRuns(): StoredRun[] {
  return rows.slice(0, 100).map((row) => ({ ...row }));
}

/** Empty the table; tests call this before each stateful round-trip. */
export function clearRuns(): void {
  rows = [];
}
