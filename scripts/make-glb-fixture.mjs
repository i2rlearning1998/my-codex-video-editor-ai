// Writes tests/fixtures/models/cube.glb: one orange cube (24 vertices), glTF 2.0 binary.
import { writeFileSync } from 'node:fs';
const pos = [],
  nor = [],
  idx = [];
const faces = [
  [0, 0, 1],
  [0, 0, -1],
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
];
faces.forEach(([nx, ny, nz], f) => {
  const a = nx ? [0, 1, 0] : [1, 0, 0],
    b = nx ? [0, 0, 1] : ny ? [0, 0, 1] : [0, 1, 0];
  for (const [u, v] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    pos.push(
      ...[0, 1, 2].map(
        (i) =>
          nx * (i === 0) +
          ny * (i === 1) +
          nz * (i === 2) +
          a[i] * u +
          b[i] * v,
      ),
    );
    nor.push(nx, ny, nz);
  }
  idx.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
});
const pb = Buffer.from(new Float32Array(pos).buffer),
  nb = Buffer.from(new Float32Array(nor).buffer),
  ib = Buffer.from(new Uint16Array(idx).buffer);
const bin = Buffer.concat([pb, nb, ib]);
const json = {
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  materials: [
    {
      pbrMetallicRoughness: {
        baseColorFactor: [1, 0.45, 0.1, 1],
        metallicFactor: 0.2,
        roughnessFactor: 0.5,
      },
    },
  ],
  meshes: [
    {
      primitives: [
        { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 },
      ],
    },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 24,
      type: 'VEC3',
      min: [-1, -1, -1],
      max: [1, 1, 1],
    },
    { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: pb.length },
    { buffer: 0, byteOffset: pb.length, byteLength: nb.length },
    { buffer: 0, byteOffset: pb.length + nb.length, byteLength: ib.length },
  ],
  buffers: [{ byteLength: bin.length }],
};
let js = Buffer.from(JSON.stringify(json));
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const pad = Buffer.alloc((4 - (bin.length % 4)) % 4);
const binP = Buffer.concat([bin, pad]);
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546c67, 0);
head.writeUInt32LE(2, 4);
head.writeUInt32LE(12 + 8 + js.length + 8 + binP.length, 8);
const ch = (len, type) => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(len, 0);
  b.writeUInt32LE(type, 4);
  return b;
};
writeFileSync(
  'tests/fixtures/models/cube.glb',
  Buffer.concat([
    head,
    ch(js.length, 0x4e4f534a),
    js,
    ch(binP.length, 0x004e4942),
    binP,
  ]),
);
