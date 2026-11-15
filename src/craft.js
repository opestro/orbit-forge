// The spacecraft you build. Every part is made from simple shapes in code (no model files),
// because the craft has to change part by part as the player designs it.
// Front of the craft is +z (it faces the planet), up is +y, the solar wings stick out along x.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const alongZ = (m) => { m.rotation.x = Math.PI / 2; return m; }; // lay a cylinder along the front-back axis
const rbox = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 3, r);
const group = (...kids) => new THREE.Group().add(...kids);
const ramp = (k, from, to) => { const t = Math.min(1, Math.max(0, (k - from) / (to - from))); return t * t * (3 - 2 * t); }; // 0 before `from`, 1 after `to`
// Shrink or grow an object towards a fixed point (used for booms and masts that slide out).
function slide(obj, [bx, by, bz], sx, sy, sz) { obj.scale.set(sx, sy, sz); obj.position.set(bx * (1 - sx), by * (1 - sy), bz * (1 - sz)); }
// A thin rod between two points (for struts and trusses).
function rod(mat, a, b, r = 0.012) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), m = mesh(cyl(r, r, A.distanceTo(B), 8), mat);
  m.position.copy(A).lerp(B, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  return m;
}

// ---------- textures, all drawn in code ----------
function canvasTexture(w, h, draw, colour = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// Crinkled foil: random soft dents turned into a normal map, so the foil catches the light unevenly.
function crinkleNormals(size = 128) {
  const h = new Float32Array(size * size);
  for (let i = 0; i < 260; i++) {
    const cx = Math.random() * size, cy = Math.random() * size, r = 3 + Math.random() * 13, a = Math.random() - 0.5;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy) / r;
      if (d < 1) h[((Math.round(cy + dy) + size) % size) * size + ((Math.round(cx + dx) + size) % size)] += a * (1 - d);
    }
  }
  return canvasTexture(size, size, (ctx) => {
    const img = ctx.createImageData(size, size), at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * 3, ny = (at(x, y - 1) - at(x, y + 1)) * 3, l = Math.hypot(nx, ny, 1);
      img.data.set([(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255, 255], (y * size + x) * 4);
    }
    ctx.putImageData(img, 0, 0);
  }, false);
}

// Solar cells: dark blue squares with thin silver wiring between them.
const cellTexture = () => canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#c9d2e0'; ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const b = 40 + Math.random() * 22;
    ctx.fillStyle = `rgb(${b * 0.25},${b * 0.55},${b * 2.6})`;
    ctx.fillRect(x * 32 + 1.5, y * 32 + 1.5, 29, 29);
    ctx.fillStyle = 'rgba(190,215,255,0.35)';
    ctx.fillRect(x * 32 + 1.5, y * 32 + 10, 29, 1); ctx.fillRect(x * 32 + 1.5, y * 32 + 21, 29, 1);
  }
});

// Painted hull panels: seams, rivets and a few service hatches.
const hullTexture = () => canvasTexture(256, 256, (ctx) => {
  ctx.fillStyle = '#f1eee6'; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#a9a69c'; ctx.lineWidth = 2;
  for (const [x, y, w, h] of [[8, 8, 240, 240], [8, 8, 120, 96], [128, 8, 120, 150], [8, 104, 120, 144], [128, 158, 120, 90]]) ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#8f8c84';
  for (let i = 16; i < 256; i += 24) for (const e of [14, 242]) { ctx.fillRect(i, e, 3, 3); ctx.fillRect(e, i, 3, 3); }
  ctx.fillStyle = '#2a2f40'; ctx.fillRect(150, 30, 70, 8); ctx.fillRect(150, 46, 70, 8); ctx.fillRect(150, 62, 70, 8);
  ctx.fillStyle = '#ff6a2b'; ctx.fillRect(22, 214, 60, 10);
  ctx.fillStyle = '#2a2f40'; ctx.font = 'bold 20px sans-serif'; ctx.fillText('OF-01', 24, 150);
});

// Radiator: fine horizontal slats that shed heat into space.
const slatTexture = () => canvasTexture(64, 64, (ctx) => {
  ctx.fillStyle = '#f7f7f4'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#b6bcc8'; for (let y = 0; y < 64; y += 8) ctx.fillRect(0, y, 64, 2);
});

// Radar face: a grid of small radio tiles.
const tileTexture = () => canvasTexture(128, 64, (ctx) => {
  ctx.fillStyle = '#b8431a'; ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#ff7a3a'; for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) ctx.fillRect(x * 16 + 2, y * 16 + 2, 12, 12);
});

export function createCraft(renderer) {
  // A soft studio-like surrounding, used only for reflections on the craft's metal, foil and glass.
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const dimmable = []; // [material, colour, reflection strength] so the craft can go dark in shadow
  const M = (color, o = {}, Type = THREE.MeshStandardMaterial) => {
    const m = new Type({ color, roughness: 0.5, metalness: 0.2, envMap: env, envMapIntensity: 0.6, flatShading: true, ...o });
    dimmable.push([m, m.color.clone(), m.envMapIntensity]);
    return m;
  };
  const lamp = (color) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.9) }); // brighter than white, so it glows
  const crinkle = crinkleNormals();
  const cells = cellTexture();
  const MAT = {
    hull: M(0xffffff, { map: hullTexture(), roughness: 0.6, metalness: 0.1 }),
    white: M(0xf2efe6, { roughness: 0.55, metalness: 0.1 }),
    orange: M(0xff6a2b, { roughness: 0.5, metalness: 0.15 }),
    red: M(0xd8343c, { roughness: 0.45, metalness: 0.2 }),
    dark: M(0x1c2030, { roughness: 0.65, metalness: 0.3 }),
    metal: M(0xaab2c2, { roughness: 0.28, metalness: 1 }),
    // Gold and silver foil blankets keep the electronics at the right temperature.
    foil: M(0xf0b040, { roughness: 0.3, metalness: 1, normalMap: crinkle, normalScale: new THREE.Vector2(0.9, 0.9) }),
    silver: M(0xd8dee8, { roughness: 0.3, metalness: 1, normalMap: crinkle, normalScale: new THREE.Vector2(0.7, 0.7) }),
    cells: M(0xffffff, { map: cells, roughness: 0.2, metalness: 0.6 }),
    radiator: M(0xffffff, { map: slatTexture(), roughness: 0.4, metalness: 0.3 }),
    tiles: M(0xffffff, { map: tileTexture(), roughness: 0.5, metalness: 0.2 }),
    // Coated lens glass with a faint rainbow sheen.
    glass: M(0x0a1228, { roughness: 0.04, metalness: 0, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.8, envMapIntensity: 1.6 }, THREE.MeshPhysicalMaterial),
    inside: M(0x05060a, { roughness: 1, metalness: 0, side: THREE.BackSide, envMapIntensity: 0 }),
    dish: M(0xf2efe6, { roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide }),
    teal: lamp(0x4dffe1), ember: lamp(0xff7a3c), lime: lamp(0x9dff5c), cyan: lamp(0x7fe9ff), warm: lamp(0xffd27a),
  };
  MAT.tiles.map.repeat.set(3, 1);

  // A camera-style lens: barrel, hood, glass and a dark inside so it looks deep.
  function lens(r, len, body, x, y, z, glow) {
    return group(
      alongZ(mesh(cyl(r, r, len), body, x, y, z)),
      alongZ(mesh(cyl(r * 1.12, r * 1.12, len * 0.22), MAT.metal, x, y, z + len * 0.42)),
      alongZ(mesh(cyl(r * 0.86, r * 0.86, len * 0.5, 12, true), MAT.inside, x, y, z + len * 0.26)),
      alongZ(mesh(cyl(r * 0.84, r * 0.84, 0.012), glow ?? MAT.glass, x, y, z + len * 0.3)),
    );
  }

  // ---------- the body every spacecraft starts with ----------
  const craft = new THREE.Group();
  const led = mesh(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshBasicMaterial({ color: 0x6dff7a }), 0.4, 0.44, 0.51);
  {
    const bus = group(
      mesh(rbox(1, 1.1, 1, 0.04), MAT.hull),
      mesh(rbox(1.035, 0.4, 1.035, 0.05), MAT.foil, 0, -0.37, 0),      // gold blanket around the tanks
      mesh(rbox(1.03, 0.13, 1.03, 0.02), MAT.orange, 0, 0.2, 0),
      mesh(box(0.92, 0.025, 0.92), MAT.dark, 0, 0.555, 0),              // top deck
      mesh(box(0.34, 0.2, 0.02), MAT.dark, -0.02, 0.02, 0.505),         // avionics window
      mesh(box(0.3, 0.02, 0.022), MAT.teal, -0.02, -0.04, 0.506),
      led,
    );
    for (const sx of [-1, 1]) {
      bus.add(mesh(box(0.02, 0.24, 0.62), MAT.radiator, sx * 0.512, 0.41, 0)); // radiators on both sides
      for (const sz of [-1, 1]) {
        bus.add(mesh(cyl(0.022, 0.022, 1.12, 8), MAT.metal, sx * 0.5, 0, sz * 0.5)); // corner rails
        // Thruster pods on the back corners: a block with two small nozzles.
        if (sz < 0) for (const sy of [-1, 1]) {
          bus.add(mesh(rbox(0.13, 0.13, 0.1, 0.02), MAT.silver, sx * 0.38, sy * 0.4, -0.53));
          const n1 = alongZ(mesh(cyl(0.02, 0.045, 0.09, 12, true), MAT.metal, sx * 0.38, sy * 0.4, -0.62));
          const n2 = mesh(cyl(0.02, 0.04, 0.08, 12, true), MAT.metal, sx * 0.47, sy * 0.4, -0.53); n2.rotation.z = sx * Math.PI / 2;
          n1.material.side = THREE.DoubleSide;
          bus.add(n1, n2);
        }
      }
    }
    // Star trackers: little cameras that find the craft's direction by looking at the stars.
    for (const sx of [-1, 1]) {
      const t = group(mesh(cyl(0.05, 0.065, 0.16, 16), MAT.dark), mesh(cyl(0.045, 0.045, 0.01, 16), MAT.glass, 0, 0.081, 0));
      t.position.set(sx * 0.33, 0.62, -0.36); t.rotation.set(-0.6, 0, -sx * 0.5);
      bus.add(t);
    }
    // Ring that clamps the craft to the rocket, and the main engine used to reach the final orbit.
    bus.add(mesh(cyl(0.36, 0.36, 0.06), MAT.metal, 0, -0.58, 0), mesh(cyl(0.3, 0.3, 0.03), MAT.dark, 0, -0.62, 0),
      mesh(cyl(0.09, 0.17, 0.14), MAT.foil, 0, -0.66, -0.2), mesh(cyl(0.06, 0.15, 0.2, 12, true), MAT.metal, 0, -0.82, -0.2));
    for (const sx of [-1, 1]) {
      // Sun sensors on the top corners, and small backup antennas that work in any direction.
      bus.add(mesh(rbox(0.08, 0.04, 0.08, 0.01), MAT.dark, sx * 0.39, 0.585, 0.39), mesh(cyl(0.025, 0.025, 0.012), MAT.glass, sx * 0.39, 0.61, 0.39),
        mesh(cyl(0.004, 0.03, 0.12, 8), MAT.metal, sx * 0.44, -0.62, 0.44));
      bus.add(rod(MAT.orange, [sx * 0.3, -0.56, 0.515], [sx * 0.3, 0.1, 0.515], 0.012)); // cable run
    }
    bus.add(rod(MAT.orange, [-0.3, 0.1, 0.515], [0.3, 0.1, 0.515], 0.012));
    const beacon = mesh(new THREE.SphereGeometry(0.03, 8, 6), MAT.ember, 0, 0.6, -0.42); // blinks so the craft can be seen from afar
    beacon.onBeforeRender = () => { beacon.scale.setScalar(performance.now() % 1400 < 220 ? 1 : 0.3); };
    bus.add(mesh(cyl(0.02, 0.03, 0.06, 8), MAT.metal, 0, 0.57, -0.42), beacon);
    craft.add(bus);
  }

  // ---------- parts ----------
  const BUILD = {
    solar(id) {
      const g = new THREE.Group();
      if (id === 'rtg') { // nuclear battery on a boom, kept away from the instruments
        const arm = group(rod(MAT.metal, [0, 0.3, -0.5], [0, 0.2, -1.5], 0.03), rod(MAT.metal, [0.2, 0, -0.5], [0, 0.2, -1.5], 0.014), rod(MAT.metal, [-0.2, 0, -0.5], [0, 0.2, -1.5], 0.014),
          alongZ(mesh(cyl(0.15, 0.15, 0.8), MAT.dark, 0, 0.2, -1.92)), alongZ(mesh(cyl(0.17, 0.17, 0.06), MAT.metal, 0, 0.2, -1.5)), alongZ(mesh(cyl(0.17, 0.17, 0.06), MAT.metal, 0, 0.2, -2.34)),
          alongZ(mesh(cyl(0.155, 0.155, 0.05), MAT.ember, 0, 0.2, -1.7)), alongZ(mesh(cyl(0.155, 0.155, 0.05), MAT.ember, 0, 0.2, -2.14)));
        for (let i = 0; i < 8; i++) { // cooling fins
          const fin = mesh(box(0.014, 0.62, 0.74), MAT.dark, 0, 0.2, -1.92); fin.rotation.z = (i / 8) * Math.PI; arm.add(fin);
        }
        g.add(arm);
        g.userData.deploy = (k) => slide(arm, [0, 0.2, -0.5], 1, 1, 0.25 + 0.75 * ramp(k, 0.1, 0.7)); // the boom slides out
        return g;
      }
      // Wings are a chain of hinged panels. Stowed, the arm points up and the panels are folded flat like a paper fan.
      const count = { small: 1, medium: 2, large: 3 }[id], wings = [];
      for (const side of [-1, 1]) {
        const wing = new THREE.Group();
        wing.position.x = side * 0.54;
        wing.add(rod(MAT.metal, [0, 0, 0], [side * 0.36, 0, 0.3], 0.016), rod(MAT.metal, [0, 0, 0], [side * 0.36, 0, -0.3], 0.016), alongZ(mesh(cyl(0.045, 0.045, 0.14), MAT.metal)));
        const hinges = [];
        let parent = wing, x = side * 0.36;
        for (let i = 0; i < count; i++) {
          const hinge = new THREE.Group();
          hinge.position.x = x;
          hinge.add(
            mesh(box(1.0, 0.012, 0.9), MAT.cells, side * 0.53, 0.014, 0),
            mesh(box(1.03, 0.022, 0.93), MAT.dark, side * 0.53, 0, 0),                                                    // carbon backing
            mesh(box(1.04, 0.03, 0.025), MAT.white, side * 0.53, 0, 0.465), mesh(box(1.04, 0.03, 0.025), MAT.white, side * 0.53, 0, -0.465), // frame
            alongZ(mesh(cyl(0.022, 0.022, 0.12, 10), MAT.metal, 0, 0, 0.3)), alongZ(mesh(cyl(0.022, 0.022, 0.12, 10), MAT.metal, 0, 0, -0.3)),
          );
          parent.add(hinge); hinges.push(hinge);
          parent = hinge; x = side * 1.06;
        }
        g.add(wing);
        wings.push({ wing, hinges, side });
      }
      g.userData.deploy = (k) => wings.forEach(({ wing, hinges, side }) => {
        const arm = ramp(k, 0, 0.35), fan = ramp(k, 0.25, 0.75);
        wing.rotation.set(0.55 * fan, 0, side * (1 - arm) * Math.PI / 2); // swing down from pointing up, then lean towards the Sun
        hinges.forEach((h, i) => { h.rotation.z = i ? side * (i % 2 ? -1 : 1) * (1 - fan) * Math.PI * 0.985 : 0; });
      });
      return g;
    },

    battery(id) {
      const s = { small: 0.26, medium: 0.4, large: 0.56 }[id], bars = { small: 1, medium: 2, large: 3 }[id];
      const g = group(
        mesh(rbox(s * 1.3, s, 0.2, 0.03), MAT.dark, 0, -0.1, -0.6),
        mesh(box(s * 1.34, s * 0.14, 0.215), MAT.silver, 0, -0.1 + s * 0.32, -0.6), mesh(box(s * 1.34, s * 0.14, 0.215), MAT.silver, 0, -0.1 - s * 0.32, -0.6), // straps
        rod(MAT.orange, [s * 0.5, -0.1 + s * 0.5, -0.6], [s * 0.5, 0.3, -0.5], 0.014), // power cable into the body
      );
      for (let i = 0; i < bars; i++) g.add(mesh(box(s * 0.24, s * 0.32, 0.02), MAT.lime, (i - (bars - 1) / 2) * s * 0.34, -0.1, -0.705));
      return g;
    },

    pointing(id) { // attitude control hardware on the side of the body
      const g = new THREE.Group();
      if (id === 'spin') { // magnetic rods that push against the planet's magnetic field
        g.add(mesh(box(0.03, 0.46, 0.05), MAT.foil, 0.522, -0.3, 0.3), mesh(box(0.03, 0.05, 0.46), MAT.foil, 0.522, -0.44, 0));
        return g;
      }
      for (const [y, z] of [[-0.27, 0.24], [-0.27, -0.14], [-0.43, 0.05]]) { // three reaction wheels, one per axis
        const wheel = mesh(cyl(0.09, 0.09, 0.05), MAT.metal, 0.53, y, z), hub = mesh(cyl(0.035, 0.035, 0.06), MAT.orange, 0.535, y, z);
        wheel.rotation.z = hub.rotation.z = Math.PI / 2;
        wheel.onBeforeRender = () => { wheel.rotation.x = performance.now() * 0.004; }; // always spinning
        g.add(wheel, hub);
      }
      if (id === 'star') { // an extra star tracker on the front edge of the top deck
        const eye = group(mesh(cyl(0.06, 0.075, 0.2), MAT.silver), mesh(cyl(0.05, 0.05, 0.012), MAT.glass, 0, 0.101, 0), mesh(cyl(0.075, 0.06, 0.08, 12, true), MAT.dark, 0, 0.14, 0));
        eye.position.set(0, 0.64, 0.4); eye.rotation.x = 0.5;
        g.add(eye);
      }
      return g;
    },

    computer(id) { // the flight computer box on the back, with status lamps
      const w = id === 'basic' ? 0.2 : 0.3, lamps = id === 'basic' ? 1 : 3, lamp = id === 'smart' ? MAT.cyan : MAT.lime;
      const g = group(mesh(rbox(w, 0.15, 0.08, 0.015), MAT.dark, 0, 0.38, -0.54), mesh(box(w * 0.9, 0.02, 0.085), MAT.metal, 0, 0.45, -0.54));
      for (let i = 0; i < lamps; i++) g.add(mesh(box(0.04, 0.03, 0.01), lamp, (i - (lamps - 1) / 2) * 0.07, 0.38, -0.583));
      if (id === 'smart') g.add(mesh(box(w, 0.012, 0.16), MAT.radiator, 0, 0.47, -0.58)); // it runs hot, so it gets its own radiator
      return g;
    },

    antenna(id) {
      const g = new THREE.Group();
      if (id === 'whip') {
        const mast = group(mesh(cyl(0.012, 0.012, 1.2, 6), MAT.metal, 0, 1.2, 0), mesh(new THREE.SphereGeometry(0.04, 10, 8), MAT.teal, 0, 1.8, 0));
        const second = mesh(cyl(0.01, 0.01, 0.7, 6), MAT.metal, 0.22, 0.9, -0.1); second.rotation.z = -0.35;
        mast.add(second);
        g.add(mesh(cyl(0.03, 0.05, 0.1), MAT.metal, 0, 0.61, 0), mast);
        g.userData.deploy = (k) => slide(mast, [0, 0.6, 0], 1, 0.12 + 0.88 * ramp(k, 0.5, 0.9), 1); // telescopes up
      }
      if (id === 'patch') {
        const plate = group(mesh(rbox(0.6, 0.05, 0.6, 0.02), MAT.white));
        for (const x of [-0.14, 0.14]) for (const z of [-0.14, 0.14]) plate.add(mesh(box(0.22, 0.012, 0.22), MAT.foil, x, 0.03, z));
        plate.position.y = 0.86;
        g.add(mesh(cyl(0.035, 0.035, 0.3, 8), MAT.metal, 0, 0.7, 0), mesh(cyl(0.06, 0.06, 0.05), MAT.metal, 0, 0.58, 0), plate);
        g.userData.deploy = (k) => { plate.rotation.x = 0.5 * ramp(k, 0.5, 0.9); }; // tips towards the planet
      }
      if (id === 'dish') {
        const pts = []; for (let i = 0; i <= 14; i++) { const r = (i / 14) * 0.64; pts.push(new THREE.Vector2(r, r * r * 0.52)); }
        const rim = 0.64 * 0.64 * 0.52;
        const dish = group(
          new THREE.Mesh(new THREE.LatheGeometry(pts, 14), MAT.dish),
          mesh(new THREE.TorusGeometry(0.64, 0.014, 6, 14), MAT.metal, 0, rim, 0),
          mesh(cyl(0.05, 0.03, 0.09), MAT.metal, 0, 0.52, 0), // feed horn at the focus
          mesh(new THREE.SphereGeometry(0.03, 10, 8), MAT.teal, 0, 0.46, 0),
        );
        dish.children[1].rotation.x = Math.PI / 2;
        for (let i = 0; i < 3; i++) { // tripod holding the feed
          const a = (i / 3) * Math.PI * 2;
          dish.add(rod(MAT.metal, [Math.cos(a) * 0.58, 0.58 * 0.58 * 0.52, Math.sin(a) * 0.58], [0, 0.52, 0], 0.008));
        }
        for (let i = 0; i < 7; i++) { // ribs on the back
          const a = (i / 7) * Math.PI * 2;
          dish.add(rod(MAT.metal, [0, -0.02, 0], [Math.cos(a) * 0.6, 0.6 * 0.6 * 0.52 - 0.02, Math.sin(a) * 0.6], 0.009));
        }
        const mount = group(dish);
        mount.position.y = 1.08;
        g.add(mesh(cyl(0.04, 0.05, 0.5, 10), MAT.metal, 0, 0.8, 0), mesh(new THREE.SphereGeometry(0.07, 12, 10), MAT.silver, 0, 1.05, 0), mount);
        let open = 1;
        g.userData.deploy = (k) => { open = ramp(k, 0.5, 0.9); dish.rotation.x = 0.5 * open; }; // tips forward, towards the planet
        dish.children[0].onBeforeRender = () => { mount.rotation.y = open * Math.sin(performance.now() * 0.0005) * 0.3; }; // keeps hunting for the ground station
      }
      if (id === 'laser') {
        const head = group(
          alongZ(mesh(cyl(0.13, 0.13, 0.5), MAT.foil)),
          alongZ(mesh(cyl(0.145, 0.145, 0.1), MAT.white, 0, 0, 0.22)),
          alongZ(mesh(cyl(0.12, 0.12, 0.24, 12, true), MAT.inside, 0, 0, 0.16)),
          alongZ(mesh(cyl(0.115, 0.115, 0.012), MAT.glass, 0, 0, 0.18)),
          alongZ(mesh(cyl(0.03, 0.03, 0.014), MAT.cyan, 0, 0, 0.19)),
          mesh(box(0.02, 0.2, 0.3), MAT.radiator, 0.15, 0, -0.08),
        );
        head.position.y = 1.0;
        g.add(mesh(cyl(0.05, 0.06, 0.3), MAT.metal, 0, 0.7, 0), mesh(box(0.34, 0.04, 0.08), MAT.metal, 0, 0.84, 0),
          mesh(box(0.03, 0.26, 0.08), MAT.metal, -0.165, 0.96, 0), mesh(box(0.03, 0.26, 0.08), MAT.metal, 0.165, 0.96, 0), head); // fork mount
        g.userData.deploy = (k) => { head.rotation.x = -1.45 + 1.1 * ramp(k, 0.5, 0.9); }; // swings down from pointing straight up
      }
      return g;
    },

    camera() {
      return group(mesh(rbox(0.26, 0.22, 0.14, 0.02), MAT.dark, -0.28, 0.33, 0.56), lens(0.09, 0.26, MAT.dark, -0.28, 0.33, 0.68),
        mesh(box(0.3, 0.012, 0.16), MAT.white, -0.28, 0.45, 0.66)); // sunshade
    },

    hires() {
      const x = 0.2, y = -0.16;
      const g = group(
        alongZ(mesh(cyl(0.25, 0.25, 1.0, 12, true), MAT.white, x, y, 0.98)),
        alongZ(mesh(cyl(0.243, 0.243, 0.98, 12, true), MAT.inside, x, y, 0.99)),
        alongZ(mesh(cyl(0.262, 0.262, 0.34), MAT.foil, x, y, 0.72)),          // foil blanket round the mirror end
        alongZ(mesh(cyl(0.22, 0.22, 0.012), MAT.glass, x, y, 0.62)),          // main mirror, deep inside
        alongZ(mesh(cyl(0.06, 0.06, 0.05), MAT.dark, x, y, 1.36)),            // small second mirror
        rod(MAT.metal, [x - 0.24, y, 1.36], [x + 0.24, y, 1.36], 0.006), rod(MAT.metal, [x, y - 0.24, 1.36], [x, y + 0.24, 1.36], 0.006),
      );
      for (const z of [0.56, 1.1, 1.47]) g.add(mesh(new THREE.TorusGeometry(0.255, 0.014, 6, 12), z === 1.47 ? MAT.orange : MAT.metal, x, y, z));
      // Dust cover on a hinge. It stays shut during launch and opens once the craft is safely in orbit.
      const hinge = group(alongZ(mesh(cyl(0.25, 0.25, 0.02), MAT.foil, 0, -0.26, 0)), mesh(box(0.08, 0.05, 0.05), MAT.metal));
      hinge.position.set(x, y + 0.26, 1.5);
      g.add(hinge);
      g.userData.deploy = (k) => { hinge.rotation.x = -2.0 * ramp(k, 0.7, 1); };
      return g;
    },

    infrared() {
      const x = -0.29, y = -0.3;
      return group(
        mesh(rbox(0.28, 0.24, 0.3, 0.02), MAT.foil, x, y, 0.62), lens(0.085, 0.16, MAT.dark, x + 0.02, y, 0.8, MAT.ember),
        mesh(cyl(0.045, 0.045, 0.26, 12), MAT.metal, x - 0.17, y, 0.6),          // cooler: heat sensors must be very cold
        mesh(box(0.02, 0.3, 0.34), MAT.radiator, x - 0.22, y, 0.62),
      );
    },

    weather() {
      const x = 0.27, y = 0.36;
      const drum = alongZ(mesh(cyl(0.11, 0.11, 0.05, 6), MAT.metal, x, y, 0.83)); // scanning mirror, always turning
      drum.onBeforeRender = () => { drum.rotation.y = performance.now() * 0.003; };
      return group(alongZ(mesh(cyl(0.17, 0.2, 0.3, 12), MAT.red, x, y, 0.62)), alongZ(mesh(cyl(0.205, 0.205, 0.04, 12), MAT.white, x, y, 0.5)),
        alongZ(mesh(cyl(0.15, 0.17, 0.12, 12, true), MAT.inside, x, y, 0.74)), alongZ(mesh(cyl(0.145, 0.145, 0.012, 12), MAT.cyan, x, y, 0.7)), drum,
        alongZ(mesh(cyl(0.2, 0.17, 0.1, 12, true), MAT.white, x, y, 0.82)));
    },

    radar() {
      const g = new THREE.Group(), array = new THREE.Group(), flaps = [];
      array.add(mesh(box(0.76, 0.05, 0.7), MAT.white), mesh(box(0.72, 0.012, 0.64), MAT.tiles, 0, -0.03, 0));
      for (const side of [-1, 1]) { // two side panels on hinges, folded underneath for launch
        const flap = group(mesh(box(0.76, 0.05, 0.7), MAT.white, side * 0.39, 0, 0), mesh(box(0.72, 0.012, 0.64), MAT.tiles, side * 0.39, -0.03, 0), alongZ(mesh(cyl(0.02, 0.02, 0.7, 8), MAT.metal)));
        flap.position.x = side * 0.39;
        array.add(flap); flaps.push([flap, side]);
      }
      array.position.set(0, -0.84, 0.35); array.rotation.x = 0.35;
      g.add(array);
      for (const x of [-0.3, 0.3]) g.add(rod(MAT.metal, [x, -0.55, 0.1], [x, -0.8, 0.2], 0.02));
      g.userData.deploy = (k) => flaps.forEach(([flap, side]) => { flap.rotation.z = -side * (1 - ramp(k, 0.3, 0.7)) * Math.PI * 0.97; });
      return g;
    },

    spectrometer() {
      const x = -0.32;
      return group(mesh(rbox(0.24, 0.2, 0.36, 0.02), MAT.silver, x, 0.67, 0.3), mesh(box(0.2, 0.14, 0.02), MAT.dark, x, 0.67, 0.485),
        mesh(box(0.15, 0.022, 0.012), MAT.teal, x, 0.67, 0.497), mesh(box(0.26, 0.012, 0.26), MAT.radiator, x, 0.78, 0.28));
    },

    altimeter() {
      const x = 0.32;
      return group(mesh(rbox(0.32, 0.1, 0.32, 0.02), MAT.metal, x, 0.61, 0.3),
        lens(0.085, 0.36, MAT.white, x + 0.07, 0.75, 0.36),                       // receiver: catches the returning light
        lens(0.04, 0.3, MAT.foil, x - 0.09, 0.72, 0.34, MAT.lime));               // laser: sends the pulse
    },

    magnetometer() { // on a long boom, far from the craft's own magnetism
      const a = [0, 0.56, -0.4], mid = [0, 1.0, -1.1], tip = [0, 1.42, -1.77];
      const boom = group(rod(MAT.metal, a, mid, 0.018), rod(MAT.metal, mid, tip, 0.013), mesh(new THREE.SphereGeometry(0.03, 10, 8), MAT.metal, ...mid),
        mesh(rbox(0.08, 0.08, 0.08, 0.015), MAT.silver, 0, 1.06, -1.1), mesh(rbox(0.13, 0.13, 0.13, 0.02), MAT.foil, ...tip));
      const g = group(boom, mesh(cyl(0.05, 0.05, 0.06), MAT.metal, 0, 0.58, -0.4));
      g.userData.deploy = (k) => { const s = 0.1 + 0.9 * ramp(k, 0.55, 0.95); slide(boom, a, s, s, s); }; // the boom extends
      return g;
    },
  };

  // k = 1 in sunlight, close to 0 in shadow.
  const setDim = (k) => dimmable.forEach(([m, colour, reflect]) => { m.color.copy(colour).multiplyScalar(k); m.envMapIntensity = reflect * k; });
  return { craft, led, BUILD, setDim };
}
