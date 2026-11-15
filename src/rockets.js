// The three rockets, modelled in low-poly from stacked sections: engines, stages, rings, fins.
// Each rocket is made of separate pieces (boosters, first stage, upper stage, two nose-cover halves)
// so the flight can show them coming apart. makeRocket() returns one standing on y = 0.
import * as THREE from 'three';
import { tint, merge, flatMaterial, beam } from './lowpoly.js';

const WHITE = 0xf4f1ea, BLACK = 0x23262f, GREY = 0x8d94a3, DARK = 0x3a3f4c, ORANGE = 0xff6a2b, BRONZE = 0xc8703a, GOLD = 0xe2a93b, BLUE = 0x2f5bd0;
const SIDES = 12;

// Paint patterns. Each returns a colour for a triangle at (x, y, z).
const quarters = (a, b) => (x, y, z) => (Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 2) - 1e-6) % 2 ? a : b); // black and white roll pattern
const stripes = (a, b) => (x, y, z) => (Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 6) - 1e-6) % 2 ? a : b);

function builder() {
  const pieces = {}; // name -> list of geometries
  const marks = {};  // heights worth remembering (where the upper stage and the payload start)
  let y = 0, current = 'stage1';
  const push = (name, ...g) => (pieces[name] ??= []).push(...g);
  const api = {
    pieces, marks,
    get y() { return y; },
    // Everything added after this call belongs to the named piece.
    piece(name) { current = name; marks[name] = y; return api; },
    // A section from radius `rb` at the bottom to `rt` at the top. The nose cover is built as two open halves.
    tube(h, rb, rt, paint) {
      if (current === 'fairing') {
        for (const [name, start] of [['fairingA', 0], ['fairingB', Math.PI]]) {
          push(name, tint(new THREE.CylinderGeometry(rt, rb, h, SIDES / 2, 1, true, start, Math.PI).translate(0, y + h / 2, 0), paint, 0.035));
        }
      } else push(current, tint(new THREE.CylinderGeometry(rt, rb, h, SIDES, 1).translate(0, y + h / 2, 0), paint, 0.035));
      y += h;
      return api;
    },
    // A slightly wider ring that sits on the last joint (does not add height).
    ring(r, paint = DARK, h = 0.22) {
      push(current, tint(new THREE.CylinderGeometry(r, r, h, SIDES, 1).translate(0, y, 0), paint, 0.03));
      return api;
    },
    // A rounded nose cone, in two halves.
    nose(h, r, paint, tip = paint) {
      const pts = [];
      for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(new THREE.Vector2(Math.max(0.001, r * (1 - t * t)), h * t)); }
      const top = y + h * 0.72;
      for (const [name, start] of [['fairingA', 0], ['fairingB', Math.PI]]) {
        push(name, tint(new THREE.LatheGeometry(pts, SIDES / 2, start, Math.PI).translate(0, y, 0), (cx, cy) => (cy > top ? tip : paint), 0.035));
      }
      y += h;
      return api;
    },
    // An engine bell hanging below height y0.
    bell(r, h, x = 0, z = 0, y0 = 0) {
      push(current, tint(new THREE.CylinderGeometry(r * 0.45, r, h, 8, 1, true).translate(x, y0 - h / 2, z), BLACK, 0.08),
        tint(new THREE.CylinderGeometry(r * 0.5, r * 0.5, h * 0.25, 8).translate(x, y0 - h * 0.05, z), GREY, 0.05));
      return api;
    },
    // `count` swept fins around the base.
    fins(count, r, w, h, paint, y0 = 0) {
      const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(w, -h * 0.12), new THREE.Vector2(w, h * 0.22), new THREE.Vector2(0, h)]);
      for (let i = 0; i < count; i++) {
        push(current, tint(new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: false }).translate(r * 0.96, y0, -0.045).rotateY((i / count) * Math.PI * 2 + Math.PI / 4), paint, 0.04));
      }
      return api;
    },
    // A cable cover running up the side.
    raceway(r, y0, h, angle = 0.4) {
      push(current, tint(new THREE.BoxGeometry(0.16, h, 0.12).translate(r + 0.03, y0 + h / 2, 0).rotateY(angle), GREY, 0.04));
      return api;
    },
    add(name, ...g) { push(name, ...g); return api; },
    // Switch which piece later details belong to (without marking a new height).
    on(name) { current = name; return api; },
    // Thin hoops around the body at the given heights.
    bands(r, heights, paint = GREY) {
      for (const h of heights) push(current, tint(new THREE.CylinderGeometry(r + 0.025, r + 0.025, 0.08, SIDES, 1).translate(0, h, 0), paint, 0.03));
      return api;
    },
    // Upright stiffening ribs, like the corrugated sections on real rockets.
    ribs(r, y0, h, count, paint = GREY) {
      for (let i = 0; i < count; i++) push(current, tint(new THREE.BoxGeometry(0.07, h, 0.07).translate(r + 0.02, y0 + h / 2, 0).rotateY((i / count) * Math.PI * 2), paint, 0.04));
      return api;
    },
    // A fuel line running up the outside.
    pipe(r, y0, h, angle, paint = GREY) {
      push(current, tint(new THREE.CylinderGeometry(0.05, 0.05, h, 5).translate(r + 0.06, y0 + h / 2, 0).rotateY(angle), paint, 0.04),
        tint(new THREE.BoxGeometry(0.14, 0.1, 0.14).translate(r + 0.05, y0, 0).rotateY(angle), DARK, 0.04), tint(new THREE.BoxGeometry(0.14, 0.1, 0.14).translate(r + 0.05, y0 + h, 0).rotateY(angle), DARK, 0.04));
      return api;
    },
    // A flat panel on the skin: a hatch, a vent or a painted marking. On the nose cover it goes on the matching half.
    plate(r, yMid, angle, w, h, paint) {
      const name = current === 'fairing' ? (Math.cos(angle) > 0 ? 'fairingA' : 'fairingB') : current;
      push(name, tint(new THREE.BoxGeometry(0.05, h, w).translate(r + 0.012, yMid, 0).rotateY(angle), paint, 0.03));
      return api;
    },
    // Small solid-fuel motors that push the stages apart.
    motors(r, y0, count, paint = DARK) {
      for (let i = 0; i < count; i++) push(current, tint(new THREE.ConeGeometry(0.09, 0.4, 6).translate(r + 0.07, y0, 0).rotateY((i / count) * Math.PI * 2 + 0.4), paint, 0.04));
      return api;
    },
    // The upper stage: its own engine tucked inside the joint, then its tank.
    upper(r, bellR) { api.piece('stage2').bell(bellR, bellR * 2, 0, 0, y + 0.1); return api; },
    // A small cone the satellite sits on, then the nose cover around it.
    payload(r) {
      push(current, tint(new THREE.CylinderGeometry(r * 0.45, r * 0.9, 0.3, SIDES).translate(0, y + 0.15, 0), GREY, 0.04));
      marks.payload = y + 0.3;
      return api.piece('fairing');
    },
  };
  return api;
}

const BUILD = {
  // Small and slim: one engine, two stages, four fins.
  sparrow() {
    const b = builder();
    b.bell(0.42, 0.8);
    for (let i = 0; i < 4; i++) b.bell(0.12, 0.35, Math.cos(i * Math.PI / 2) * 0.48, Math.sin(i * Math.PI / 2) * 0.48); // steering engines
    b.fins(4, 0.6, 0.95, 1.9, ORANGE, 0.1).raceway(0.6, 1.2, 6.5);
    b.tube(0.5, 0.62, 0.6, DARK).tube(6.6, 0.6, 0.6, WHITE).tube(1.1, 0.6, 0.6, quarters(BLACK, WHITE)).tube(0.9, 0.6, 0.6, WHITE)
      .ring(0.64).tube(0.9, 0.6, 0.54, DARK)                           // joint between the stages
      .upper(0.54, 0.3).tube(0.5, 0.54, 0.54, ORANGE).tube(2.6, 0.54, 0.54, WHITE).ring(0.58, GREY)
      .payload(0.54).tube(0.5, 0.54, 0.62, WHITE).tube(1.3, 0.62, 0.62, WHITE).nose(2.3, 0.62, WHITE, ORANGE);
    b.on('stage1').ribs(0.62, 0.05, 0.4, 12, GREY).ribs(0.6, 9.15, 0.8, 12).bands(0.6, [2.2, 3.9, 5.6]).pipe(0.6, 1.0, 7.4, 2.6)
      .plate(0.6, 4.7, -0.9, 0.5, 0.9, BLACK).plate(0.6, 6.3, 1.9, 0.45, 0.45, ORANGE).plate(0.6, 3.0, 1.9, 0.3, 0.3, BLACK).motors(0.6, 8.8, 4);
    b.on('stage2').bands(0.54, [11.4, 12.3]).plate(0.54, 11.85, 0.5, 0.4, 0.5, BLACK).pipe(0.54, 10.7, 2.1, -2.0).plate(0.54, 12.7, 2.4, 0.3, 0.25, GOLD);
    b.on('fairing').plate(0.62, 14.25, 0.7, 0.5, 0.7, BLUE).plate(0.62, 14.25, Math.PI + 0.7, 0.5, 0.7, BLUE).plate(0.62, 13.75, -0.8, 0.25, 0.2, BLACK);
    b.marks.radius = 0.62;
    return b;
  },

  // Medium: bronze core with two strap-on boosters and a wide "hammerhead" nose cover.
  heron() {
    const b = builder();
    b.bell(0.42, 0.9, -0.42).bell(0.42, 0.9, 0.42).raceway(1.0, 1.0, 14, 1.2).raceway(1.0, 1.0, 14, -1.9);
    b.tube(0.7, 1.04, 1.0, DARK).tube(9.5, 1.0, 1.0, BRONZE).ring(1.04, DARK).tube(1.0, 1.0, 1.0, WHITE).tube(0.6, 1.0, 1.0, ORANGE).tube(4.2, 1.0, 1.0, WHITE)
      .ring(1.05).tube(1.2, 1.0, 1.0, stripes(DARK, GREY))             // joint between the stages
      .upper(1.0, 0.45).tube(0.5, 1.0, 1.0, GOLD).tube(2.6, 1.0, 1.0, WHITE).ring(1.04, GREY)
      .payload(1.0).tube(0.9, 1.0, 1.36, WHITE).tube(1.2, 1.36, 1.36, WHITE).tube(0.5, 1.36, 1.36, BLUE).tube(2.6, 1.36, 1.36, WHITE).nose(3.4, 1.36, WHITE, ORANGE);
    [-1, 1].forEach((side, i) => { // boosters, with struts holding them to the core
      const s = builder();
      s.bell(0.3, 0.6).tube(0.4, 0.44, 0.42, DARK).tube(6.6, 0.42, 0.42, WHITE).tube(0.4, 0.42, 0.42, ORANGE).tube(1.4, 0.42, 0.42, WHITE);
      s.add('stage1', tint(new THREE.ConeGeometry(0.42, 1.5, SIDES).translate(0, s.y + 0.75, 0), WHITE, 0.035));
      b.add(`booster${i}`, merge(s.pieces.stage1).translate(0, 0.1, side * 1.46),
        beam([0, 1.4, side * 1.0], [0, 1.6, side * 1.3], 0.1, GREY), beam([0, 7.6, side * 1.0], [0, 7.4, side * 1.3], 0.1, GREY));
    });
    b.on('stage1').ribs(1.04, 0.05, 0.6, 12, GREY).ribs(1.0, 16.05, 1.1, 12).bands(1.0, [2.6, 4.6, 6.6, 8.6, 13.0, 14.6]).pipe(1.0, 1.0, 14.6, 0.2).pipe(1.0, 1.0, 9.0, 3.0, BRONZE)
      .plate(1.0, 13.9, -0.5, 0.9, 1.3, BLUE).plate(1.0, 12.4, -0.5, 0.9, 0.35, ORANGE).plate(1.0, 5.2, 2.2, 0.6, 1.0, BLACK).plate(1.0, 9.2, -2.4, 0.5, 0.5, BLACK).motors(1.0, 15.8, 6);
    b.on('stage2').bands(1.0, [18.4, 19.4]).plate(1.0, 18.9, 0.9, 0.7, 0.7, BLACK).pipe(1.0, 17.8, 2.3, -1.2).plate(1.0, 19.9, -2.2, 0.5, 0.3, GOLD);
    b.on('fairing').plate(1.36, 24.3, 0.6, 1.0, 1.4, BLUE).plate(1.36, 24.3, Math.PI + 0.6, 1.0, 1.4, BLUE).plate(1.36, 21.7, -0.7, 0.4, 0.3, BLACK).plate(1.36, 21.7, Math.PI - 0.7, 0.4, 0.3, BLACK);
    b.marks.radius = 1.36;
    return b;
  },

  // Heavy Moon rocket: a wide first stage with five engines, a long upper stage that steps inwards, and a big cargo nose.
  albatross() {
    const b = builder();
    b.bell(0.62, 1.3);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, x = Math.cos(a) * 1.25, z = Math.sin(a) * 1.25;
      b.bell(0.62, 1.3, x, z);
      // Streamlined covers over the outer engines.
      b.add('stage1', tint(new THREE.ConeGeometry(0.72, 3.0, 8).translate(Math.cos(a) * 1.72, 1.5, Math.sin(a) * 1.72), WHITE, 0.04));
    }
    b.fins(4, 2.0, 1.5, 2.4, WHITE, 0.2).raceway(2.0, 1.0, 11, 0.4).raceway(2.0, 1.0, 11, 3.5);
    b.tube(0.8, 2.06, 2.0, BLACK).tube(3.0, 2.0, 2.0, quarters(BLACK, WHITE)).tube(6.4, 2.0, 2.0, WHITE).tube(0.5, 2.0, 2.0, ORANGE).tube(2.2, 2.0, 2.0, quarters(WHITE, BLACK))
      .ring(2.06, BLACK, 0.3).tube(1.4, 2.0, 2.0, stripes(BLACK, WHITE))    // joint between the stages
      .upper(2.0, 0.8).tube(7.2, 2.0, 2.0, WHITE).ring(2.05, BLACK, 0.3).tube(0.7, 2.0, 2.0, BLACK)
      .tube(2.3, 2.0, 1.3, quarters(BLACK, WHITE))                           // cone down to the narrower top tank
      .tube(4.6, 1.3, 1.3, WHITE).tube(0.8, 1.3, 1.3, quarters(WHITE, BLACK)).ring(1.34, DARK, 0.3).tube(0.4, 1.3, 1.3, DARK)
      .payload(1.3).tube(1.2, 1.3, 1.75, WHITE).tube(1.6, 1.75, 1.75, WHITE).tube(0.5, 1.75, 1.75, ORANGE).tube(2.4, 1.75, 1.75, WHITE).nose(4.2, 1.75, WHITE, BLACK);
    b.on('stage1').ribs(2.06, 0.05, 0.7, 24, GREY).ribs(2.0, 12.95, 1.3, 24, WHITE).bands(2.0, [4.4, 6.0, 7.6, 9.2], GREY)
      .pipe(2.0, 1.2, 11.2, 1.2).pipe(2.0, 1.2, 11.2, 1.2 + Math.PI).pipe(2.0, 1.2, 8.0, 2.4, WHITE)
      .plate(2.0, 7.2, -0.5, 1.0, 3.6, ORANGE).plate(2.0, 5.0, 2.7, 0.8, 1.2, BLACK).plate(2.0, 8.9, 2.7, 0.6, 0.6, BLACK).motors(2.0, 12.5, 8);
    b.on('stage2').ribs(2.0, 21.55, 0.6, 24, GREY).bands(2.0, [16.2, 18.0, 19.8], GREY).bands(1.3, [25.6, 26.8, 28.0], GREY)
      .pipe(2.0, 14.6, 6.6, 0.3).pipe(1.3, 24.7, 4.2, -1.0).plate(2.0, 17.4, -0.5, 1.0, 2.2, ORANGE).plate(1.3, 27.2, 0.9, 0.7, 0.9, BLACK).plate(2.0, 19.4, 2.4, 0.7, 0.7, BLACK).motors(1.3, 29.7, 4);
    b.on('fairing').plate(1.75, 34.6, 0.6, 1.2, 1.8, BLUE).plate(1.75, 34.6, Math.PI + 0.6, 1.2, 1.8, BLUE).plate(1.75, 32.2, -0.7, 0.5, 0.4, BLACK).plate(1.75, 32.2, Math.PI - 0.7, 0.5, 0.4, BLACK);
    b.marks.radius = 1.75;
    return b;
  },
};

const material = flatMaterial({ roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });
const cache = {};

function prepare(id) {
  const b = BUILD[id](), merged = {};
  let min = Infinity, max = -Infinity;
  for (const name in b.pieces) {
    merged[name] = merge(b.pieces[name]);
    merged[name].computeBoundingBox();
    min = Math.min(min, merged[name].boundingBox.min.y); max = Math.max(max, merged[name].boundingBox.max.y);
  }
  // Shrink to 1 unit tall, and centre each piece on itself so it can tumble around its own middle.
  const k = 1 / (max - min), pieces = {};
  for (const name in merged) {
    const g = merged[name].translate(0, -min, 0).scale(k, k, k);
    g.computeBoundingBox();
    const centre = g.boundingBox.getCenter(new THREE.Vector3());
    pieces[name] = { geo: g.translate(-centre.x, -centre.y, -centre.z), centre };
  }
  const h = (v) => (v - min) * k;
  return { pieces, upperY: h(b.marks.stage2), payloadY: h(b.marks.payload), radius: b.marks.radius * k };
}

// A rocket `height` units tall, standing on y = 0.
// group.userData: { stage1, stage2, fairingA, fairingB, boosters: [], upperY, payloadY, radius } (heights already scaled).
export function makeRocket(id, height) {
  const r = cache[id] ??= prepare(id);
  const group = new THREE.Group(), boosters = [];
  group.userData = { boosters, upperY: r.upperY * height, payloadY: r.payloadY * height, radius: r.radius * height };
  for (const name in r.pieces) {
    const m = new THREE.Mesh(r.pieces[name].geo, material);
    m.castShadow = m.receiveShadow = true;
    m.scale.setScalar(height);
    m.position.copy(r.pieces[name].centre).multiplyScalar(height);
    group.add(m);
    if (name.startsWith('booster')) boosters.push(m); else group.userData[name] = m;
  }
  return group;
}
