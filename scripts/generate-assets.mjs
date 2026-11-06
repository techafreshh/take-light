// Vendored CC0-stand-in asset generator (Node only, zero dependencies).
// Emits two spec-valid uncompressed GLB 2.0 binaries (box-composed
// character+jetpack and danfo van) plus a small dusk equirect JPEG for
// PMREM environment lighting. The binaries are checked in under
// public/assets/ so the game never fetches models at runtime; the real
// CC0 upstreams (Kenney/Quaternius packs, Poly Haven dusk HDRI) are
// documented in public/assets/ATTRIBUTION.md as drop-in replacements.
//
// Usage: node scripts/generate-assets.mjs --out public/assets

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const GLB_MAGIC = 0x46546c67; // ASCII 'glTF' (little-endian)
const JSON_CHUNK_TYPE = 0x4e4f534a; // ASCII 'JSON'
const BIN_CHUNK_TYPE = 0x004e4942; // ASCII 'BIN\0'

// ---------------------------------------------------------------------------
// Box geometry (BoxGeometry-equivalent indexed mesh: 24 verts + normals).
// ---------------------------------------------------------------------------

function boxGeometry(w, h, d, cx, cy, cz) {
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  // Outward normals with CCW windings viewed from outside each face.
  const faces = [
    { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
    { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
  ];
  const positions = new Float32Array(72);
  const normals = new Float32Array(72);
  const indices = new Uint16Array(36);
  let vp = 0;
  faces.forEach((face, fi) => {
    for (const corner of face.v) {
      positions[vp * 3] = corner[0] + cx;
      positions[vp * 3 + 1] = corner[1] + cy;
      positions[vp * 3 + 2] = corner[2] + cz;
      normals[vp * 3] = face.n[0];
      normals[vp * 3 + 1] = face.n[1];
      normals[vp * 3 + 2] = face.n[2];
      vp += 1;
    }
    const base = fi * 4;
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], fi * 6);
  });
  return { positions, normals, indices };
}

// ---------------------------------------------------------------------------
// GLB 2.0 assembly (JSON chunk + little-endian BIN chunk, 4-byte aligned).
// ---------------------------------------------------------------------------

function toBuffer(view) {
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}

function vecMinMax(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a += 1) {
      const v = positions[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max };
}

function buildGlb({ boxes, materials, meshes, nodes }) {
  const binParts = [];
  const bufferViews = [];
  const accessors = [];
  let byteOffset = 0;
  const pushView = (buffer) => {
    const index = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: buffer.length });
    binParts.push(buffer);
    byteOffset += buffer.length;
    return index;
  };
  // Every box segment is a multiple of 4 bytes (288/288/72), so the
  // running offset stays 4-byte aligned throughout.
  const boxAccessors = boxes.map((box) => {
    const posView = pushView(toBuffer(box.positions));
    const nrmView = pushView(toBuffer(box.normals));
    const idxView = pushView(toBuffer(box.indices));
    const { min, max } = vecMinMax(box.positions);
    const posIndex = accessors.length;
    accessors.push({
      bufferView: posView,
      byteOffset: 0,
      componentType: 5126,
      count: 24,
      type: 'VEC3',
      min,
      max,
    });
    const nrmIndex = accessors.length;
    accessors.push({
      bufferView: nrmView,
      byteOffset: 0,
      componentType: 5126,
      count: 24,
      type: 'VEC3',
    });
    const idxIndex = accessors.length;
    accessors.push({
      bufferView: idxView,
      byteOffset: 0,
      componentType: 5123,
      count: 36,
      type: 'SCALAR',
    });
    return { posIndex, nrmIndex, idxIndex };
  });
  const gltfMeshes = meshes.map((mesh) => ({
    name: mesh.name,
    primitives: mesh.boxes.map((boxRef) => {
      const acc = boxAccessors[boxRef.box];
      return {
        attributes: { POSITION: acc.posIndex, NORMAL: acc.nrmIndex },
        indices: acc.idxIndex,
        material: boxRef.material,
      };
    }),
  }));
  const json = {
    asset: { version: '2.0', generator: 'take-light scripts/generate-assets.mjs' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes: nodes.map((node) => {
      const out = { name: node.name, mesh: node.mesh };
      if (node.translation !== undefined) out.translation = node.translation;
      return out;
    }),
    meshes: gltfMeshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };
  const jsonText = JSON.stringify(json);
  const jsonBytes = Buffer.from(jsonText, 'utf8');
  const jsonPadded = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20);
  jsonBytes.copy(jsonPadded);
  const binBytes = Buffer.concat(binParts);
  const binPadded = Buffer.alloc(Math.ceil(binBytes.length / 4) * 4, 0x00);
  binBytes.copy(binPadded);
  const totalLength = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK_TYPE, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binPadded.length, 0);
  binHeader.writeUInt32LE(BIN_CHUNK_TYPE, 4);
  return Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binPadded]);
}

function stdMaterial(name, baseColor, emissive) {
  return {
    name,
    doubleSided: true,
    pbrMetallicRoughness: {
      baseColorFactor: [...baseColor, 1.0],
      metallicFactor: 0.1,
      roughnessFactor: 0.7,
    },
    emissiveFactor: emissive,
  };
}

// Player: violet body box with a cyan emissive plus a gold jetpack box
// riding behind (+Z, opposite the -Z idle heading).
function playerJetpackGlb() {
  return buildGlb({
    boxes: [
      boxGeometry(0.7, 1.1, 0.45, 0, 1.0, 0),
      boxGeometry(0.55, 0.8, 0.3, 0, 1.05, 0),
    ],
    materials: [
      stdMaterial('body', [0.56, 0.48, 1.0], [0.0, 0.9, 1.0]),
      stdMaterial('jetpack', [1.0, 0.82, 0.4], [1.0, 0.55, 0.15]),
    ],
    meshes: [
      { name: 'body', boxes: [{ box: 0, material: 0 }] },
      { name: 'jetpack', boxes: [{ box: 1, material: 1 }] },
    ],
    nodes: [
      { name: 'body', mesh: 0 },
      { name: 'jetpack', mesh: 1, translation: [0, 0, 0.38] },
    ],
  });
}

// Danfo van: yellow body box with a dark window band protruding 0.01 on
// every side so it reads as glazing instead of z-fighting.
function danfoGlb() {
  return buildGlb({
    boxes: [
      boxGeometry(2.0, 1.2, 4.5, 0, 0.9, 0),
      boxGeometry(2.02, 0.4, 3.0, 0, 1.2, 0),
    ],
    materials: [
      stdMaterial('danfo-yellow', [1.0, 0.76, 0.1], [0.35, 0.2, 0.0]),
      stdMaterial('danfo-glass', [0.08, 0.08, 0.11], [0.0, 0.0, 0.0]),
    ],
    meshes: [
      { name: 'van-body', boxes: [{ box: 0, material: 0 }] },
      { name: 'van-glass', boxes: [{ box: 1, material: 1 }] },
    ],
    nodes: [
      { name: 'van-body', mesh: 0 },
      { name: 'van-glass', mesh: 1 },
    ],
  });
}

// ---------------------------------------------------------------------------
// Minimal baseline-DCT JPEG encoder (4:4:4, standard Annex K tables) for
// the 512x256 dusk equirect gradient. Dependency-free by design.
// ---------------------------------------------------------------------------

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33,
  40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43,
  36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60,
  61, 54, 47, 55, 62, 63,
];

const STD_LUMA_Q = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

const STD_CHROMA_Q = [
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
];

const BITS_DC_LUMA = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const VALS_DC_LUMA = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const BITS_DC_CHROMA = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const VALS_DC_CHROMA = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const BITS_AC_LUMA = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const VALS_AC_LUMA = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
  0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
  0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
  0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];
const BITS_AC_CHROMA = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
const VALS_AC_CHROMA = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41,
  0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
  0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1,
  0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44,
  0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
  0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74,
  0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a,
  0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
  0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7,
  0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];

function scaleQuantTable(base, quality) {
  const q = Math.min(100, Math.max(1, quality));
  const scale = q < 50 ? Math.floor(5000 / q) : 200 - q * 2;
  return base.map((v) => Math.min(255, Math.max(1, Math.floor((v * scale + 50) / 100))));
}

function buildHuffman(bits, values) {
  const codes = new Map();
  const sizes = new Map();
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len += 1) {
    const count = bits[len - 1];
    for (let i = 0; i < count; i += 1) {
      const sym = values[k];
      k += 1;
      codes.set(sym, code);
      sizes.set(sym, len);
      code += 1;
    }
    code <<= 1;
  }
  return { codes, sizes };
}

class BitWriter {
  constructor() {
    this.bytes = [];
    this.acc = 0;
    this.nbits = 0;
  }
  write(code, size) {
    this.acc = (this.acc << size) | code;
    this.nbits += size;
    while (this.nbits >= 8) {
      this.nbits -= 8;
      const byte = (this.acc >>> this.nbits) & 0xff;
      this.bytes.push(byte);
      if (byte === 0xff) this.bytes.push(0x00);
    }
    this.acc &= (1 << this.nbits) - 1;
  }
  finish() {
    if (this.nbits > 0) {
      const pad = 8 - this.nbits;
      const byte = ((this.acc << pad) | ((1 << pad) - 1)) & 0xff;
      this.bytes.push(byte);
      if (byte === 0xff) this.bytes.push(0x00);
    }
    return Buffer.from(this.bytes);
  }
}

function categoryOf(value) {
  const abs = Math.abs(value);
  let size = 0;
  let tmp = abs;
  while (tmp > 0) {
    size += 1;
    tmp >>= 1;
  }
  return size;
}

function writeAmplitudes(writer, value, size) {
  if (size <= 0) return;
  const bits = value >= 0 ? value : value - 1;
  writer.write(bits & ((1 << size) - 1), size);
}

const COS_TABLE = (() => {
  const table = [];
  for (let u = 0; u < 8; u += 1) {
    table[u] = [];
    for (let x = 0; x < 8; x += 1) {
      table[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
  }
  return table;
})();

function fdct(block) {
  const out = new Array(64);
  for (let v = 0; v < 8; v += 1) {
    for (let u = 0; u < 8; u += 1) {
      let sum = 0;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          sum += block[y * 8 + x] * COS_TABLE[u][x] * COS_TABLE[v][y];
        }
      }
      const cu = u === 0 ? 1 / Math.SQRT2 : 1;
      const cv = v === 0 ? 1 / Math.SQRT2 : 1;
      out[v * 8 + u] = 0.25 * cu * cv * sum;
    }
  }
  return out;
}

function markerSegment(marker, payload) {
  const header = Buffer.alloc(2 + 2);
  header[0] = 0xff;
  header[1] = marker;
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

function dqtPayload(lumaQ, chromaQ) {
  const payload = Buffer.alloc(1 + 64 + 1 + 64);
  payload[0] = 0x00;
  for (let i = 0; i < 64; i += 1) payload[1 + i] = lumaQ[ZIGZAG[i]];
  payload[65] = 0x01;
  for (let i = 0; i < 64; i += 1) payload[66 + i] = chromaQ[ZIGZAG[i]];
  return payload;
}

function dhtPayload(table) {
  // table: { info, bits[16], values[] }
  const payload = Buffer.alloc(1 + 16 + table.values.length);
  payload[0] = table.info;
  for (let i = 0; i < 16; i += 1) payload[1 + i] = table.bits[i];
  for (let i = 0; i < table.values.length; i += 1) payload[17 + i] = table.values[i];
  return payload;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp255(v) {
  return Math.min(255, Math.max(0, Math.round(v)));
}

// Dusk gradient: indigo top (#1b1035) -> ember horizon (#ff9a5c) with a
// soft sun glow at center-x, settling into lagoon low (#0e4d7a).
function duskPixel(x, y, width, height) {
  const t = y / (height - 1);
  const top = [0x1b, 0x10, 0x35];
  const horizon = [0xff, 0x9a, 0x5c];
  const low = [0x0e, 0x4d, 0x7a];
  const horizonY = 0.62;
  let r;
  let g;
  let b;
  if (t < horizonY) {
    const k = Math.pow(t / horizonY, 1.6);
    r = lerp(top[0], horizon[0], k);
    g = lerp(top[1], horizon[1], k);
    b = lerp(top[2], horizon[2], k);
  } else {
    const k = Math.min(1, (t - horizonY) / 0.14);
    r = lerp(horizon[0], low[0], k);
    g = lerp(horizon[1], low[1], k);
    b = lerp(horizon[2], low[2], k);
  }
  const dx = x / (width - 1) - 0.5;
  const dy = (t - horizonY) * 3.2;
  const glow = Math.exp(-(dx * dx) / 0.02 - dy * dy) * (1 - Math.abs(t - horizonY) * 2.4);
  if (glow > 0) {
    r += glow * 60;
    g += glow * 28;
    b += glow * 8;
  }
  return [clamp255(r), clamp255(g), clamp255(b)];
}

function rgbToYCbCr(r, g, b) {
  return [
    0.299 * r + 0.587 * g + 0.114 * b,
    128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  ];
}

function encodeJpeg(width, height, quality) {
  const lumaQ = scaleQuantTable(STD_LUMA_Q, quality);
  const chromaQ = scaleQuantTable(STD_CHROMA_Q, quality);
  const huffDcLuma = buildHuffman(BITS_DC_LUMA, VALS_DC_LUMA);
  const huffDcChroma = buildHuffman(BITS_DC_CHROMA, VALS_DC_CHROMA);
  const huffAcLuma = buildHuffman(BITS_AC_LUMA, VALS_AC_LUMA);
  const huffAcChroma = buildHuffman(BITS_AC_CHROMA, VALS_AC_CHROMA);

  const planes = [new Float32Array(width * height), new Float32Array(width * height), new Float32Array(width * height)];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = duskPixel(x, y, width, height);
      const [yy, cb, cr] = rgbToYCbCr(r, g, b);
      planes[0][y * width + x] = yy - 128;
      planes[1][y * width + x] = cb - 128;
      planes[2][y * width + x] = cr - 128;
    }
  }

  const writer = new BitWriter();
  const block = new Array(64);
  const dcPred = [0, 0, 0];
  const tables = [
    { q: lumaQ, dc: huffDcLuma, ac: huffAcLuma },
    { q: chromaQ, dc: huffDcChroma, ac: huffAcChroma },
    { q: chromaQ, dc: huffDcChroma, ac: huffAcChroma },
  ];
  for (let c = 0; c < 3; c += 1) {
    const { q, dc, ac } = tables[c];
    const plane = planes[c];
    for (let by = 0; by < height; by += 8) {
      for (let bx = 0; bx < width; bx += 8) {
        for (let y = 0; y < 8; y += 1) {
          for (let x = 0; x < 8; x += 1) {
            block[y * 8 + x] = plane[(by + y) * width + (bx + x)];
          }
        }
        const coeffs = fdct(block);
        const zz = new Array(64);
        for (let i = 0; i < 64; i += 1) {
          zz[i] = Math.round(coeffs[ZIGZAG[i]] / q[ZIGZAG[i]]);
        }
        const delta = zz[0] - dcPred[c];
        dcPred[c] = zz[0];
        const cat = categoryOf(delta);
        writer.write(dc.codes.get(cat), dc.sizes.get(cat));
        writeAmplitudes(writer, delta, cat);
        let zeroRun = 0;
        for (let i = 1; i < 64; i += 1) {
          const v = zz[i];
          if (v === 0) {
            zeroRun += 1;
            continue;
          }
          while (zeroRun > 15) {
            writer.write(ac.codes.get(0xf0), ac.sizes.get(0xf0));
            zeroRun -= 16;
          }
          const size = categoryOf(v);
          const sym = (zeroRun << 4) | size;
          writer.write(ac.codes.get(sym), ac.sizes.get(sym));
          writeAmplitudes(writer, v, size);
          zeroRun = 0;
        }
        if (zeroRun > 0) {
          writer.write(ac.codes.get(0x00), ac.sizes.get(0x00));
        }
      }
    }
  }
  const entropy = writer.finish();

  const soi = Buffer.from([0xff, 0xd8]);
  const app0 = markerSegment(0xe0, Buffer.concat([
    Buffer.from('JFIF\0', 'ascii'),
    Buffer.from([0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
  ]));
  const dqt = markerSegment(0xdb, dqtPayload(lumaQ, chromaQ));
  const sof0 = markerSegment(0xc0, (() => {
    const payload = Buffer.alloc(15);
    payload[0] = 8;
    payload.writeUInt16BE(height, 1);
    payload.writeUInt16BE(width, 3);
    payload[5] = 3;
    payload[6] = 1; payload[7] = 0x11; payload[8] = 0;
    payload[9] = 2; payload[10] = 0x11; payload[11] = 1;
    payload[12] = 3; payload[13] = 0x11; payload[14] = 1;
    return payload;
  })());
  const dht = markerSegment(0xc4, Buffer.concat([
    dhtPayload({ info: 0x00, bits: BITS_DC_LUMA, values: VALS_DC_LUMA }),
    dhtPayload({ info: 0x10, bits: BITS_AC_LUMA, values: VALS_AC_LUMA }),
    dhtPayload({ info: 0x01, bits: BITS_DC_CHROMA, values: VALS_DC_CHROMA }),
    dhtPayload({ info: 0x11, bits: BITS_AC_CHROMA, values: VALS_AC_CHROMA }),
  ]));
  const sos = markerSegment(0xda, (() => {
    const payload = Buffer.alloc(10);
    payload[0] = 3;
    payload[1] = 1; payload[2] = 0x00;
    payload[3] = 2; payload[4] = 0x11;
    payload[5] = 3; payload[6] = 0x11;
    payload[7] = 0; payload[8] = 63; payload[9] = 0;
    return payload;
  })());
  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([soi, app0, dqt, sof0, dht, sos, entropy, eoi]);
}

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

function parseOutDir(argv) {
  const flag = argv.indexOf('--out');
  if (flag >= 0 && flag + 1 < argv.length) return resolve(argv[flag + 1]);
  const eq = argv.find((a) => a.startsWith('--out='));
  if (eq !== undefined) return resolve(eq.slice('--out='.length));
  return resolve(join(dirname(new URL(import.meta.url).pathname), '..', 'public', 'assets'));
}

const outDir = parseOutDir(process.argv.slice(2));
mkdirSync(outDir, { recursive: true });

const playerGlb = playerJetpackGlb();
const danfoGlbBytes = danfoGlb();
const equirectJpg = encodeJpeg(512, 256, 75);

const outputs = [
  ['player-jetpack.glb', playerGlb],
  ['danfo.glb', danfoGlbBytes],
  ['dusk-equirect.jpg', equirectJpg],
];
for (const [name, bytes] of outputs) {
  writeFileSync(join(outDir, name), bytes);
  console.log(`wrote ${join(outDir, name)} (${bytes.length} bytes)`);
}
