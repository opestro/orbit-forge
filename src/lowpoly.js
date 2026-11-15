// Building blocks for the low-poly look: flat faces, one colour per triangle, slightly uneven shapes.
// Everything returns plain geometry with a `color` attribute, so many pieces can be merged into one mesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A fixed random sequence, so the landscape looks the same every time.
let seed = 20261114;
export const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
export const pick = (list) => list[Math.floor(rnd() * list.length)];

const C = new THREE.Color();

// Colour a geometry one triangle at a time. `paint` is a colour, or a function of the triangle's centre.
// `vary` makes each triangle a little lighter or darker, which is what gives low-poly art its texture.
export function tint(geo, paint, vary = 0.07) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    C.set(typeof paint === 'function' ? paint(cx, cy, cz) : paint);
    const k = 1 + (rnd() - 0.5) * 2 * vary;
    for (let j = 0; j < 3; j++) col.set([C.r * k, C.g * k, C.b * k], (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Nudge every corner a little. Corners that share a position move together, so no gaps open up.
export function jitter(geo, amount) {
  const p = geo.attributes.position, moved = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(2)},${p.getY(i).toFixed(2)},${p.getZ(i).toFixed(2)}`;
    let o = moved.get(key);
    if (!o) { o = [(rnd() - 0.5) * amount, (rnd() - 0.5) * amount, (rnd() - 0.5) * amount]; moved.set(key, o); }
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  return geo;
}

export const at = (geo, x, y, z, turn = 0) => geo.rotateY(turn).translate(x, y, z);
export const merge = (parts) => mergeGeometries(parts, false);
export const flatMaterial = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0, ...o });
export function solid(parts, material = flatMaterial()) {
  const m = new THREE.Mesh(merge(parts), material);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// Smooth random hills (value noise), used for the terrain and for where forests grow.
const hash = (x, y) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}
export const hills = (x, y) => noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.15;
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- scenery pieces (each stands on y = 0) ----------
const PINE = [[0x2f8f4e, 0x37a058, 0x44b062], [0x3d9a3f, 0x56b84a, 0x7fcb55], [0x8cc152, 0xa5d46a, 0xbfe27a]];
export function pine(h) {
  const greens = pick(PINE), tiers = 3 + (rnd() > 0.5 ? 1 : 0), parts = [];
  parts.push(tint(new THREE.CylinderGeometry(h * 0.03, h * 0.05, h * 0.3, 5).translate(0, h * 0.15, 0), 0x6b4a2f, 0.1));
  for (let i = 0; i < tiers; i++) {
    const r = h * (0.27 - i * 0.055), ch = h * 0.38;
    const cone = jitter(new THREE.ConeGeometry(r, ch, 6 + (i % 2)), h * 0.025).rotateY(rnd() * 6).translate(0, h * (0.2 + i * 0.19) + ch / 2, 0);
    parts.push(tint(cone, greens[Math.min(i, 2)], 0.08));
  }
  return merge(parts);
}

const LEAF = [0x4fa83d, 0x6fbf3f, 0x8fd14f, 0x3f9a4a];
export function leafy(h) {
  const parts = [tint(new THREE.CylinderGeometry(h * 0.035, h * 0.06, h * 0.55, 5).translate(0, h * 0.275, 0), 0x7a5230, 0.1)];
  for (let i = 0; i < 3; i++) {
    const r = h * (0.2 + rnd() * 0.12), a = rnd() * 6;
    const blob = jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.3).translate(Math.cos(a) * h * 0.14, h * (0.6 + rnd() * 0.22), Math.sin(a) * h * 0.14);
    parts.push(tint(blob, pick(LEAF), 0.1));
  }
  return merge(parts);
}

export function rock(s) {
  const g = jitter(new THREE.DodecahedronGeometry(s, 0), s * 0.35).scale(1, 0.6 + rnd() * 0.5, 1).translate(0, s * 0.3, 0);
  return tint(g, pick([0xb9b2a8, 0xa39c93, 0xcfc8bd]), 0.12);
}

export const bush = (s) => tint(jitter(new THREE.IcosahedronGeometry(s, 0), s * 0.3).scale(1, 0.75, 1).translate(0, s * 0.45, 0), pick([0x3c9a4a, 0x4fae4f, 0x2f8644]), 0.1);

export function grass(s) {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.ConeGeometry(s * 0.09, s * (0.7 + rnd() * 0.6), 3).translate(0, s * 0.4, 0).rotateZ((rnd() - 0.5) * 0.7).rotateY(rnd() * 6).translate((rnd() - 0.5) * s * 0.5, 0, (rnd() - 0.5) * s * 0.5);
    parts.push(tint(blade, pick([0x7fcf5a, 0x9bdc63, 0x5fb84a, 0xc9d86a]), 0.1));
  }
  return merge(parts);
}

export function palm(h) {
  const parts = [], lean = (rnd() - 0.5) * 0.5;
  for (let i = 0; i < 5; i++) { // a trunk that bends as it rises
    parts.push(tint(new THREE.CylinderGeometry(h * 0.028, h * 0.036, h * 0.21, 5).translate(Math.sin(i * 0.5) * lean * h * 0.25, h * (0.1 + i * 0.2), 0), i % 2 ? 0x9a7b4f : 0x86693f, 0.08));
  }
  const top = [Math.sin(2) * lean * h * 0.25, h, 0];
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.ConeGeometry(h * 0.07, h * 0.5, 3).scale(1, 1, 0.25).translate(0, h * 0.25, 0).rotateZ(-1.1 - rnd() * 0.5).rotateY((i / 7) * Math.PI * 2 + rnd() * 0.4).translate(...top);
    parts.push(tint(frond, pick([0x4fae4f, 0x63c153, 0x3f9a4a]), 0.1));
  }
  parts.push(tint(new THREE.IcosahedronGeometry(h * 0.045, 0).translate(top[0], h * 0.97, 0), 0x6b4a2f, 0.1));
  return merge(parts);
}

export function flowers(s) {
  const parts = [], colour = pick([0xff5a5f, 0xffd23f, 0xffffff, 0xb07cf7, 0xff8fb1]);
  for (let i = 0; i < 5; i++) {
    const x = (rnd() - 0.5) * s * 1.6, z = (rnd() - 0.5) * s * 1.6, h = s * (0.5 + rnd() * 0.5);
    parts.push(tint(new THREE.CylinderGeometry(s * 0.02, s * 0.02, h, 3).translate(x, h / 2, z), 0x4b9a3e, 0.05), tint(new THREE.OctahedronGeometry(s * 0.16, 0).translate(x, h, z), colour, 0.08));
  }
  return merge(parts);
}

export function stump(s) {
  return merge([tint(new THREE.CylinderGeometry(s * 0.8, s, s * 1.2, 6).translate(0, s * 0.6, 0), 0x7a5230, 0.1), tint(new THREE.CylinderGeometry(s * 0.7, s * 0.7, 0.1, 6).translate(0, s * 1.22, 0), 0xd9b67a, 0.06)]);
}

export function log(s) {
  return merge([tint(new THREE.CylinderGeometry(s * 0.5, s * 0.55, s * 5, 6).rotateZ(Math.PI / 2).translate(0, s * 0.5, 0), 0x7a5230, 0.1),
    tint(new THREE.CylinderGeometry(s * 0.42, s * 0.42, 0.1, 6).rotateZ(Math.PI / 2).translate(s * 2.52, s * 0.5, 0), 0xd9b67a, 0.06)]);
}

// A straight beam between two points, for towers and trusses.
export function beam(a, b, thick, colour) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const g = new THREE.BoxGeometry(thick, len, thick);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return tint(g, colour, 0.05);
}
