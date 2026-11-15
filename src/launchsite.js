// The launch site on the ground, in low-poly: a coast with hills, forest and mountains, a launch
// complex, and the lift-off shot with smoke, fire and sparks. The sky above it is realistic, with
// three layers of drifting cloud. Sizes are roughly in metres, east is +x.
// It has its own scene and camera; scene.js shows it while the rocket is still near the ground.
import * as THREE from 'three';
import { rnd, tint, jitter, at, merge, solid, flatMaterial, hills, smooth, pine, leafy, rock, bush, grass, beam, palm, flowers, stump, log } from './lowpoly.js';

const SKY = { top: new THREE.Color(0x2f7fd8), horizon: new THREE.Color(0xc9e4fb), fog: new THREE.Color(0xc4e0f3) };
const SPACE = new THREE.Color(0x060a1c);
const T_IGNITE = 3.6, T_RELEASE = 4.4; // engines light, then the clamps let go
const PAD_TOP = 6;

// Ground height at any point: flat around the pad, rolling hills further out, mountains on the
// horizon, and a beach sloping into the sea to the east (+x).
function heightAt(x, z) {
  const d = Math.hypot(x, z), land = 1 - smooth(250, 430, x);
  const roll = (hills(x * 0.004 + 3, z * 0.004 + 8) - 0.42) * 95 * smooth(150, 620, d);
  const peaks = smooth(720, 1400, d) * (120 + hills(x * 0.0022 + 7, z * 0.0022 + 2) * 470);
  return land * Math.max(1, 2 + roll + peaks) - (1 - land) * 16;
}

function terrain() {
  const g = new THREE.PlaneGeometry(4400, 4400, 150, 150).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  const GRASS = [0x57b84f, 0x49a646, 0x6cc35a, 0x5fb04a];
  const m = new THREE.Mesh(tint(g, (x, y, z) => {
    const slope = (Math.abs(heightAt(x + 12, z) - heightAt(x - 12, z)) + Math.abs(heightAt(x, z + 12) - heightAt(x, z - 12))) / 24;
    if (y < 0.2) return 0xd9c58a;                       // sea bed
    if (x > 190 && y < 5) return 0xeeddaa;              // beach
    if (y > 380) return 0xf6f8fb;                       // snow
    if (slope > 0.62 || y > 300) return slope > 0.9 ? 0x8d8379 : 0xa89e92; // bare rock
    if (y > 170) return 0x7fa85a;                       // thin grass high up
    const patch = hills(x * 0.006 + 20, z * 0.006 + 4);
    if (patch > 0.66) return 0xb9c95a;                  // dry meadow
    if (patch < 0.3 && y > 6) return 0x3f9a4a;          // dark, damp grass
    return GRASS[Math.floor(hills(x * 0.02, z * 0.02) * 4) % 4];
  }, 0.06), flatMaterial());
  m.receiveShadow = true;
  return m;
}

// Low-poly sea: turquoise in the shallows, deep blue further out, a pale line of foam at the shore.
// The wave shape is moved in the shader, and flat shading turns it into shifting facets.
function sea(time) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.22, metalness: 0.12, transparent: true, opacity: 0.94 });
  mat.onBeforeCompile = (s) => {
    s.uniforms.t = time;
    s.vertexShader = 'uniform float t;\n' + s.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n transformed.z += sin(position.x * 0.021 + t * 1.1) * 1.1 + cos(position.y * 0.027 + t * 0.8) * 1.1 + sin((position.x + position.y) * 0.05 + t * 1.7) * 0.5;');
  };
  const g = new THREE.PlaneGeometry(6400, 6400, 200, 200), p = g.attributes.position, col = new Float32Array(p.count * 3);
  const foam = new THREE.Color(0xf2fbff), shallow = new THREE.Color(0x63dccb), mid = new THREE.Color(0x27a3c9), deep = new THREE.Color(0x176fae), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const depth = -heightAt(p.getX(i), -p.getY(i)); // the plane is laid flat, so its y runs along -z
    if (depth < 1.2) c.copy(foam).lerp(shallow, smooth(0.2, 1.2, depth));
    else if (depth < 8) c.copy(shallow).lerp(mid, smooth(1.2, 8, depth));
    else c.copy(mid).lerp(deep, smooth(8, 15.5, depth));
    c.toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, mat);
  m.rotation.x = -Math.PI / 2; m.position.y = -0.5; m.receiveShadow = true;
  return m;
}

// Everything that never moves: forest, rocks, grass, the pad and the buildings, merged into one mesh.
function scenery() {
  const parts = [];
  const put = (geo, x, z) => parts.push(at(geo, x, heightAt(x, z), z, rnd() * 6));
  const clearOfRoad = (x, z) => !(Math.abs(z) < 30 && x < 0 && x > -1000);

  for (let i = 0; i < 1500; i++) { // forest, thicker where the "forest" noise is high
    const x = -1700 + rnd() * 1960, z = (rnd() - 0.5) * 3200, d = Math.hypot(x, z), h = heightAt(x, z);
    if (d < 120 || h < 3 || h > 260 || !clearOfRoad(x, z)) continue;
    const wood = hills(x * 0.003 + 5, z * 0.003 + 9);
    if (rnd() > (wood > 0.5 ? 0.9 : 0.3) * smooth(95, 180, d)) continue;
    put(rnd() < 0.78 ? pine(13 + rnd() * 20) : leafy(12 + rnd() * 12), x, z);
  }
  for (let i = 0; i < 150; i++) { // rocks and bushes
    const x = -1200 + rnd() * 1500, z = (rnd() - 0.5) * 2200;
    if (Math.hypot(x, z) < 75 || heightAt(x, z) < 1.5 || !clearOfRoad(x, z)) continue;
    put(rnd() < 0.5 ? rock(2 + rnd() * 7) : bush(2 + rnd() * 3.5), x, z);
  }
  for (let i = 0; i < 620; i++) { // grass tufts near the pad, where the camera sits
    const a = rnd() * Math.PI * 2, r = 62 + rnd() * 300, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (heightAt(x, z) < 1.5 || !clearOfRoad(x, z)) continue;
    put(grass(2 + rnd() * 3), x, z);
  }
  for (let i = 0; i < 420; i++) { // flowers in the meadows, stumps and fallen logs near the trees
    const a = rnd() * Math.PI * 2, r = 66 + rnd() * 520, x = Math.cos(a) * r, z = Math.sin(a) * r, h = heightAt(x, z);
    if (h < 2 || h > 200 || x > 185 || !clearOfRoad(x, z)) continue;
    const roll = rnd();
    put(roll < 0.8 ? flowers(2 + rnd() * 2) : roll < 0.9 ? stump(1.2 + rnd()) : log(1 + rnd() * 0.8), x, z);
  }
  for (let i = 0; i < 70; i++) { // palms along the beach, and rocks standing in the shallows
    const x = 185 + rnd() * 95, z = (rnd() - 0.5) * 2400;
    if (heightAt(x, z) > 0.8) put(palm(12 + rnd() * 10), x, z);
    if (i % 3 === 0) parts.push(at(rock(4 + rnd() * 8), 285 + rnd() * 90, -3, (rnd() - 0.5) * 2400, rnd() * 6));
  }

  const CONCRETE = 0xcfc9bd, ROAD = 0xdccd9f, STEEL = 0x8d94a3, RED = 0xd8452e, WHITE = 0xf4f1ea, DARK = 0x33363f;
  const STRIPE = 0xffc93c, TEAL = 0x2bb6a8, BLUE = 0x2f5bd0, ORANGE = 0xff6a2b, TYRE = 0x23262f;
  // Launch pad: a concrete mound with a flame trench and a road for the rocket transporter.
  parts.push(
    tint(new THREE.CylinderGeometry(42, 56, PAD_TOP, 8).translate(0, PAD_TOP / 2, 0), CONCRETE, 0.05),
    tint(new THREE.BoxGeometry(11, 1, 70).translate(0, PAD_TOP + 0.1, 0), DARK, 0.06),
    tint(new THREE.BoxGeometry(960, 1.2, 24).translate(-530, 1.7, 0), ROAD, 0.05),
    tint(new THREE.BoxGeometry(26, 1.2, 24).rotateZ(0.2).translate(-50, 3.6, 0), ROAD, 0.05),
  );
  // Water tower (the water is sprayed under the rocket at lift-off to soften the noise).
  for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) parts.push(beam([72 + dx * 1.4, 2, 78 + dz * 1.4], [72 + dx, 34, 78 + dz], 0.9, STEEL));
  parts.push(tint(new THREE.CylinderGeometry(11, 9, 11, 10).translate(72, 39, 78), WHITE, 0.04), tint(new THREE.CylinderGeometry(11.2, 11.2, 2, 10).translate(72, 40, 78), RED, 0.04),
    tint(new THREE.ConeGeometry(11.5, 5, 10).translate(72, 47, 78), WHITE, 0.04));
  // Fuel tanks with pipes running to the pad.
  for (const [x, z] of [[-34, -104], [-66, -112]]) {
    parts.push(tint(jitter(new THREE.IcosahedronGeometry(12, 1), 0.4).translate(x, 15, z), WHITE, 0.04), tint(new THREE.CylinderGeometry(6, 8, 6, 8).translate(x, 4, z), CONCRETE, 0.05),
      beam([x, 4, z + 12], [x * 0.3, 5, -40], 0.8, STEEL));
  }
  // Control bunker, floodlights and the tall assembly building in the distance.
  parts.push(tint(new THREE.BoxGeometry(34, 9, 20).translate(-128, 6, 82), CONCRETE, 0.05), tint(new THREE.BoxGeometry(30, 2.4, 0.6).translate(-128, 7, 71.8), DARK, 0.05),
    tint(new THREE.ConeGeometry(4, 3, 8, 1, true).rotateX(-2.2).translate(-118, 14, 82), WHITE, 0.04), beam([-118, 10, 82], [-118, 13, 82], 0.5, STEEL));
  for (const [x, z] of [[-70, -62], [70, -62]]) {
    parts.push(beam([x, 2, z], [x, 34, z], 0.8, STEEL), tint(new THREE.BoxGeometry(7, 3.2, 1.4).translate(x, 35, z), 0xffe9a8, 0.03));
  }
  const vx = -1010, vz = -230, vy = heightAt(vx, vz);
  parts.push(tint(new THREE.BoxGeometry(150, 170, 190).translate(vx, vy + 85, vz), 0xe9ecef, 0.03), tint(new THREE.BoxGeometry(152, 130, 44).translate(vx, vy + 66, vz + 30), 0x3d4656, 0.03),
    tint(new THREE.BoxGeometry(152, 10, 192).translate(vx, vy + 160, vz), RED, 0.03), tint(new THREE.BoxGeometry(90, 60, 130).translate(vx + 10, vy + 30, vz + 170), 0xdfe3e8, 0.03));

  // Lighthouse on a rocky point, a wooden pier, and three sailing boats.
  const lx = 300, lz = -470;
  parts.push(at(rock(26), lx, -6, lz, 1), at(rock(16), lx - 18, -5, lz + 14, 2),
    tint(new THREE.CylinderGeometry(4.2, 6.5, 38, 8).translate(lx, 24, lz), (x, y) => (Math.floor(y / 7.6) % 2 ? RED : WHITE), 0.04),
    tint(new THREE.CylinderGeometry(5.4, 5.4, 1.2, 8).translate(lx, 43.6, lz), DARK, 0.04), tint(new THREE.CylinderGeometry(3.2, 3.2, 5, 8).translate(lx, 46.7, lz), 0xffe9a8, 0.03),
    tint(new THREE.ConeGeometry(4.6, 5, 8).translate(lx, 51.7, lz), RED, 0.04));
  for (let i = 0; i < 9; i++) {
    const x = 262 + i * 14;
    parts.push(tint(new THREE.BoxGeometry(14.5, 0.7, 7).translate(x, 2.6, 190), 0xb98b56, 0.09), beam([x - 6, -10, 187.5], [x - 6, 2.4, 187.5], 0.9, 0x7a5230), beam([x - 6, -10, 192.5], [x - 6, 2.4, 192.5], 0.9, 0x7a5230));
    if (i % 2 === 0) parts.push(beam([x, 2.9, 193.2], [x, 5.4, 193.2], 0.4, 0x7a5230));
  }
  for (const [bx, bz, turn, sail] of [[520, 110, 0.6, WHITE], [760, -260, -0.4, ORANGE], [600, 520, 2.2, WHITE]]) {
    parts.push(at(merge([tint(new THREE.CylinderGeometry(3.4, 1.6, 3.4, 4).scale(2.6, 1, 1).translate(0, 0.7, 0), 0x7a5230, 0.08), beam([0, 2, 0], [0, 26, 0], 0.5, 0x5a3c22),
      tint(new THREE.ConeGeometry(8, 21, 3).scale(1, 1, 0.08).translate(3.5, 14.5, 0), sail, 0.04), tint(new THREE.ConeGeometry(5, 15, 3).scale(1, 1, 0.08).translate(-3.2, 11, 0), WHITE, 0.04)]), bx, -0.6, bz, turn));
  }
  // Tracking dish on the nearest hill: it follows the rocket and receives its radio signals.
  const tx = -300, tz = -330, ty = heightAt(tx, tz);
  parts.push(tint(new THREE.CylinderGeometry(7, 9, 16, 8).translate(tx, ty + 8, tz), WHITE, 0.04), beam([tx, ty + 16, tz], [tx + 4, ty + 26, tz + 6], 2.2, STEEL),
    tint(new THREE.ConeGeometry(21, 9, 12, 1, true).rotateX(Math.PI).rotateX(-0.75).rotateY(-0.6).translate(tx + 6, ty + 31, tz + 9), WHITE, 0.05),
    beam([tx + 6, ty + 31, tz + 9], [tx + 13, ty + 38, tz + 19], 0.7, STEEL), tint(new THREE.OctahedronGeometry(1.8, 0).translate(tx + 13, ty + 38, tz + 19), RED, 0.04),
    tint(new THREE.BoxGeometry(22, 7, 14).translate(tx - 26, ty + 3.5, tz + 4), CONCRETE, 0.05));
  // Hangar with a curved roof, and stacked shipping containers.
  parts.push(tint(new THREE.CylinderGeometry(24, 24, 70, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(-250, 2, -150), 0xdfe3e8, 0.05),
    tint(new THREE.BoxGeometry(30, 20, 1).translate(-250, 12, -114.6), DARK, 0.05), tint(new THREE.BoxGeometry(48, 2, 71).translate(-250, 2.5, -150), CONCRETE, 0.04));
  [[-176, 96, ORANGE, 0], [-176, 103, BLUE, 0], [-176, 99.5, TEAL, 5.2], [-160, 98, WHITE, 0], [-158, 106, RED, 0], [-190, 104, STRIPE, 0]].forEach(([x, z, colour, lift]) => {
    parts.push(at(merge([tint(new THREE.BoxGeometry(13, 5, 5.2).translate(0, 2.6, 0), colour, 0.06), tint(new THREE.BoxGeometry(0.3, 4.4, 4.6).translate(6.55, 2.6, 0), DARK, 0.05)]), x, 2 + lift, z, lift ? 0.2 : 0));
  });
  // Vehicles: fuel tankers, a truck, a few cars, and the giant crawler that carried the rocket to the pad.
  const wheels = (len, w) => [-1, 1].flatMap((sz) => [-0.36, 0.36].map((sx) => tint(new THREE.CylinderGeometry(1, 1, 0.8, 8).rotateX(Math.PI / 2).translate(sx * len, 1, sz * w), TYRE, 0.05)));
  const truck = (colour, tank) => merge([tint(new THREE.BoxGeometry(4, 3.6, 4.6).translate(5.5, 2.9, 0), colour, 0.05), tint(new THREE.BoxGeometry(1.2, 1.4, 4).translate(7.2, 3.6, 0), 0x9fd8f0, 0.04),
    tank ? tint(new THREE.CylinderGeometry(2.3, 2.3, 9.5, 8).rotateZ(Math.PI / 2).translate(-1.6, 3.5, 0), WHITE, 0.04) : tint(new THREE.BoxGeometry(9.5, 3.6, 4.6).translate(-1.6, 3.2, 0), 0xe9ecef, 0.05),
    tint(new THREE.BoxGeometry(14, 0.6, 4.2).translate(0.5, 1.3, 0), DARK, 0.05), ...wheels(14, 2.2)]);
  const car = (colour) => merge([tint(new THREE.BoxGeometry(5.4, 1.5, 2.6).translate(0, 1.4, 0), colour, 0.05), tint(new THREE.BoxGeometry(2.8, 1.2, 2.3).translate(-0.3, 2.7, 0), 0x9fd8f0, 0.04), ...wheels(5, 1.3).map((w) => w.scale(1, 0.6, 1))]);
  parts.push(at(truck(ORANGE, true), -22, PAD_TOP, 24, 0.5), at(truck(BLUE, false), -150, 2.3, -6, 0), at(truck(WHITE, true), -210, 2.3, 6, Math.PI),
    at(car(RED), -122, 2, 62, 0.2), at(car(TEAL), -134, 2, 62, 0.1), at(car(WHITE), -146, 2, 63, -0.1), at(car(STRIPE), -112, 2, 96, 1.6));
  parts.push(at(merge([tint(new THREE.BoxGeometry(34, 4, 26).translate(0, 6.5, 0), 0x9aa3b0, 0.05), tint(new THREE.BoxGeometry(6, 5, 6).translate(13, 11, -9), STRIPE, 0.05),
    ...[[-12, -10], [12, -10], [-12, 10], [12, 10]].map(([x, z]) => tint(new THREE.BoxGeometry(11, 4.5, 6).translate(x, 2.25, z), TYRE, 0.07)), beam([-17, 8.5, -13], [17, 8.5, -13], 0.5, STRIPE), beam([-17, 8.5, 13], [17, 8.5, 13], 0.5, STRIPE)]), -330, 2.3, 0, 0));
  // Road: centre dashes and a rail fence on both sides.
  for (let x = -80; x > -990; x -= 26) {
    parts.push(tint(new THREE.BoxGeometry(9, 0.12, 1).translate(x, 2.36, 0), WHITE, 0.03));
    for (const z of [-16, 16]) parts.push(tint(new THREE.BoxGeometry(0.8, 4, 0.8).translate(x, heightAt(x, z) + 2, z), WHITE, 0.05), beam([x, heightAt(x, z) + 3, z], [x - 26, heightAt(x - 26, z) + 3, z], 0.35, WHITE));
  }
  // Pad: safety rail round the edge, hazard markings, edge lights, pipes and a windsock.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, b = ((i + 1) / 24) * Math.PI * 2, r = 40.5, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(z) < 14 && x < 0) continue; // gap where the road comes up
    parts.push(tint(new THREE.BoxGeometry(0.5, 3, 0.5).translate(x, PAD_TOP + 1.5, z), STRIPE, 0.04), beam([x, PAD_TOP + 2.8, z], [Math.cos(b) * r, PAD_TOP + 2.8, Math.sin(b) * r], 0.3, STRIPE));
    if (i % 3 === 0) parts.push(tint(new THREE.BoxGeometry(1.2, 0.6, 1.2).translate(Math.cos(a) * 37, PAD_TOP + 0.3, Math.sin(a) * 37), 0xffe9a8, 0.03));
    parts.push(tint(new THREE.BoxGeometry(5.4, 0.14, 2).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * 22, PAD_TOP + 0.07, Math.sin(a) * 22), i % 2 ? STRIPE : DARK, 0.04));
  }
  parts.push(beam([-26, PAD_TOP + 0.5, -34], [16, PAD_TOP + 0.5, -34], 0.8, STEEL), beam([16, PAD_TOP + 0.5, -34], [16, PAD_TOP + 0.5, -8], 0.8, STEEL), beam([-10, PAD_TOP + 0.5, 30], [8, PAD_TOP + 0.5, 12], 0.7, ORANGE),
    beam([30, PAD_TOP, 26], [30, PAD_TOP + 16, 26], 0.4, WHITE), tint(new THREE.ConeGeometry(1.5, 7, 6).rotateZ(1.35).translate(33.6, PAD_TOP + 15.4, 26), ORANGE, 0.05),
    tint(new THREE.BoxGeometry(8, 5, 6).translate(26, PAD_TOP + 2.5, -22), WHITE, 0.05), tint(new THREE.BoxGeometry(8.4, 0.6, 6.4).translate(26, PAD_TOP + 5.3, -22), RED, 0.04));
  return solid(parts);
}

// The service tower beside the rocket and the three lightning masts, sized for each rocket.
function tower(height, armLength) {
  const RED = 0xd8452e, STEEL = 0x8d94a3, WHITE = 0xf4f1ea, parts = [];
  const w = 2.6, x0 = -(armLength + w), top = PAD_TOP + 3 + height * 1.1;
  const corners = [[-w, -w], [w, -w], [w, w], [-w, w]];
  for (const [dx, dz] of corners) parts.push(beam([x0 + dx, PAD_TOP, dz], [x0 + dx, top, dz], 0.5, RED));
  for (let y = PAD_TOP + 7, level = 0; y <= top; y += 7, level++) {
    corners.forEach(([dx, dz], i) => {
      const [nx, nz] = corners[(i + 1) % 4];
      parts.push(beam([x0 + dx, y, dz], [x0 + nx, y, nz], 0.34, RED));
      if ((i + level) % 2 === 0) parts.push(beam([x0 + dx, y - 7, dz], [x0 + nx, y, nz], 0.22, STEEL)); // cross-bracing
    });
    if (level % 2 === 0) parts.push(tint(new THREE.BoxGeometry(w * 2.6, 0.4, w * 2.6).translate(x0, y, 0), STEEL, 0.05));
  }
  parts.push(beam([x0, top, 0], [x0 + 9, top + 5, 0], 0.6, RED), beam([x0, top, 0], [x0 - 5, top + 2, 0], 0.6, RED), beam([x0, top, 0], [x0, top + 14, 0], 0.3, STEEL));
  [[-58, -50], [58, -50], [74, 36]].forEach(([x, z]) => {
    const h = height * 1.45 + 14;
    parts.push(tint(new THREE.CylinderGeometry(0.35, 1.5, h, 6).translate(x, 2 + h / 2, z), WHITE, 0.04), tint(new THREE.CylinderGeometry(0.08, 0.08, 9, 4).translate(x, 2 + h + 4.5, z), STEEL, 0.04));
  });
  // Lift shaft, zigzag stairs, fuel pipes and work lights.
  parts.push(tint(new THREE.BoxGeometry(2, top - PAD_TOP, 2).translate(x0 - w - 1.2, (top + PAD_TOP) / 2, 0), 0xc9ced6, 0.04), tint(new THREE.BoxGeometry(2.6, 3, 2.6).translate(x0 - w - 1.2, top + 1.5, 0), RED, 0.04),
    beam([x0 + w + 0.5, PAD_TOP, 1.6], [x0 + w + 0.5, top - 4, 1.6], 0.3, 0xff6a2b), beam([x0 + w + 0.5, PAD_TOP, -1.6], [x0 + w + 0.5, top - 4, -1.6], 0.3, 0xc9ced6));
  for (let y = PAD_TOP, flip = 1; y + 7 <= top; y += 7, flip = -flip) {
    parts.push(beam([x0 - flip * w * 0.8, y, w + 0.6], [x0 + flip * w * 0.8, y + 7, w + 0.6], 0.5, STEEL));
    parts.push(tint(new THREE.BoxGeometry(0.7, 0.7, 0.7).translate(x0 + w, y + 6.4, -w), 0xffe9a8, 0.03));
  }
  const g = new THREE.Group().add(solid(parts));
  // Swing arms that hold the rocket and feed it fuel. They swing away just before lift-off.
  const arms = [0.3, 0.58, 0.86].map((share) => {
    const arm = new THREE.Group();
    arm.add(solid([tint(new THREE.BoxGeometry(armLength, 1.1, 1.3).translate(armLength / 2, 0, 0), WHITE, 0.04), tint(new THREE.BoxGeometry(1.2, 1.5, 1.7).translate(armLength - 0.6, 0, 0), RED, 0.04)]));
    arm.position.set(x0 + w, PAD_TOP + 3 + height * share, 0);
    g.add(arm);
    return arm;
  });
  return { group: g, arms };
}

export function createLaunchSite() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY.fog.clone(), 500, 3800);
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 16000);
  const time = { value: 0 };

  // Realistic sky: deep blue overhead, pale haze at the horizon, a glow around the Sun and the Sun's disc.
  const sunDir = new THREE.Vector3(-280, 400, 240).normalize(), dim = { value: 0 };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(7000, 48, 24), new THREE.ShaderMaterial({
    uniforms: { top: { value: SKY.top.clone() }, horizon: { value: SKY.horizon.clone() }, sunDir: { value: sunDir }, dim },
    vertexShader: 'varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform float dim; varying vec3 d;
      void main() {
        vec3 dir = normalize(d);
        float h = clamp(dir.y, 0.0, 1.0), s = max(dot(dir, sunDir), 0.0);
        vec3 col = mix(horizon, top, pow(h, 0.42));
        col = mix(col, vec3(0.95, 0.93, 0.86), pow(1.0 - h, 9.0) * 0.5 * (1.0 - dim));            // warm haze low down
        col += vec3(1.0, 0.86, 0.62) * (pow(s, 10.0) * 0.22 + pow(s, 180.0) * 0.8) * (1.0 - dim); // glow around the Sun
        col += vec3(6.0, 5.6, 4.8) * smoothstep(0.99925, 0.9996, s);                               // the Sun itself
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));

  // Clouds in layers, drawn from moving noise: puffy cumulus low down, a broken sheet higher up,
  // and thin streaks of ice cloud at the top. Each layer drifts at its own speed.
  function cloudLayer(y, scale, cover, alpha, wind, stretch) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(26000, 26000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { t: time, sunDir: { value: sunDir }, dim, scale: { value: scale }, cover: { value: cover }, alpha: { value: alpha }, wind: { value: new THREE.Vector2(...wind) }, stretch: { value: stretch } },
      vertexShader: 'varying vec3 w; void main(){ vec4 p = modelMatrix * vec4(position,1.0); w = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }',
      fragmentShader: `
        uniform float t; uniform float scale; uniform float cover; uniform float alpha; uniform float stretch; uniform float dim;
        uniform vec3 sunDir; uniform vec2 wind; varying vec3 w;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.02 + 13.7; a *= 0.5; } return s; }
        float density(vec2 p) { return fbm(p) + (fbm(p * 3.1 + 5.0) - 0.5) * 0.28; }
        void main() {
          vec2 p = w.xz * scale * vec2(1.0, stretch) + wind * t;
          float d = density(p), c = smoothstep(cover, cover + 0.2, d);
          if (c < 0.01) discard;
          float toward = density(p + normalize(sunDir.xz) * 0.22);            // more cloud towards the Sun = this part is in shade
          float lit = clamp(0.62 + (d - toward) * 2.6, 0.0, 1.0);
          vec3 col = mix(vec3(0.55, 0.62, 0.75), vec3(1.22, 1.18, 1.1), lit);
          col = mix(col, vec3(0.86, 0.92, 1.0), 0.25 * (1.0 - c));             // thin edges take the colour of the sky
          float far = 1.0 - smoothstep(3500.0, 11000.0, length(w.xz - cameraPosition.xz));
          col = mix(vec3(0.86, 0.93, 1.0), col, 0.35 + 0.65 * far);            // far clouds fade into haze
          gl_FragColor = vec4(col * (1.0 - 0.5 * dim), c * alpha * far);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    m.position.y = y;
    return m;
  }
  const cloudLayers = [cloudLayer(700, 0.0015, 0.57, 0.96, [0.02, 0.008], 1), cloudLayer(1700, 0.0006, 0.63, 0.7, [0.011, -0.005], 1), cloudLayer(4200, 0.00022, 0.52, 0.38, [0.004, 0.002], 3.2)];

  // Warm sun with soft shadows, cool light from the sky.
  const sun = new THREE.DirectionalLight(0xffe4bd, 2.7);
  sun.position.set(-280, 400, 240);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -330, right: 330, top: 330, bottom: -330, near: 50, far: 1400 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6; sun.shadow.radius = 3;
  scene.add(sky, ...cloudLayers, sun, new THREE.HemisphereLight(0xcfe6ff, 0x8f7f5a, 0.95), terrain(), sea(time), scenery());

  // A few birds circling over the forest.
  const birds = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const wing = (side) => tint(new THREE.ConeGeometry(0.5, 3.4, 3).scale(1, 1, 0.2).rotateZ(side * 1.25).translate(side * 1.5, 0.3, 0), 0x2b2f3a, 0.05);
    const bird = new THREE.Mesh(merge([wing(1), wing(-1)]), flatMaterial({ fog: false }));
    const a = (i / 9) * 0.9, r = 230 + (i % 3) * 16;
    bird.position.set(Math.cos(a) * r, 95 + (i % 4) * 7, Math.sin(a) * r); bird.rotation.y = -a;
    birds.add(bird);
  }
  birds.position.set(-160, 0, -120);
  scene.add(birds);

  // ---------- rocket, fire, smoke, sparks ----------
  const stack = new THREE.Group();        // tower and launch table, rebuilt for each rocket
  const rocketHolder = new THREE.Group(); // moves up with the rocket
  scene.add(stack, rocketHolder);

  // Layered flame: orange outside, yellow, then white-hot in the middle. Colours above 1 make it glow.
  const hot = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), fog: false });
  const flame = new THREE.Group();
  [[1, 1, hot(3.2, 0.9, 0.15)], [0.66, 0.8, hot(4, 2.2, 0.5)], [0.36, 0.55, hot(5, 4.6, 3.2)]].forEach(([w, l, m]) => {
    flame.add(new THREE.Mesh(new THREE.ConeGeometry(w, l, 6, 1, true).rotateX(Math.PI).translate(0, -l / 2, 0), m));
  });
  const fire = new THREE.PointLight(0xff9a3c, 0, 600, 1.1);
  rocketHolder.add(flame, fire);

  // Smoke: chunky puffs that pop out, tumble and shrink away. One instanced mesh draws them all.
  const N = 280, dummy = new THREE.Object3D(), colour = new THREE.Color(), white = new THREE.Color(0.96, 0.95, 0.94);
  const smoke = new THREE.InstancedMesh(jitter(new THREE.IcosahedronGeometry(1, 0), 0.35), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 }), N);
  smoke.castShadow = true; smoke.frustumCulled = false;
  const puffs = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), age: 9, life: 1, size: 1, spin: 0 }));
  const hide = (mesh, i) => { dummy.scale.setScalar(0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); };
  for (let i = 0; i < N; i++) { hide(smoke, i); smoke.setColorAt(i, white); }
  // Sparks thrown out at ignition.
  const S = 70, sparks = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), hot(5, 2.4, 0.4), S);
  sparks.frustumCulled = false;
  const bits = Array.from({ length: S }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), age: 9 }));
  for (let i = 0; i < S; i++) hide(sparks, i);
  // A ring of dust racing outwards across the pad.
  const dust = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2e6c8, transparent: true, opacity: 0, depthWrite: false }));
  dust.position.y = PAD_TOP + 0.4;
  scene.add(smoke, sparks, dust);

  const baseY = PAD_TOP + 3; // top of the launch table
  let next = 0, debt = 0, height = 30, rocketY = 0, speed = 0, arms = [], sparked = false, lastShot = -1;
  let turn = 0, near = 0; // the slow circling of the camera, and how far it has moved in for the pre-launch review
  const lookAt = new THREE.Vector3(), tmp = new THREE.Vector3(), vel = new THREE.Vector3();
  function puff(pos, v, life, size) {
    const q = puffs[next]; next = (next + 1) % N;
    q.p.copy(pos); q.v.copy(v); q.age = 0; q.life = life; q.size = size; q.spin = rnd() * 6;
  }

  // rocket: a model `rocketHeight` metres tall with its base at y = 0.
  function start(rocket, rocketHeight) {
    height = rocketHeight;
    const armLength = height * 0.08 + 5, table = height * 0.2 + 5;
    stack.clear();
    const t = tower(height, armLength);
    arms = t.arms;
    stack.add(t.group, solid([tint(new THREE.BoxGeometry(table, 3, table).translate(0, PAD_TOP + 1.5, 0), 0x4a4e5a, 0.05),
      ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => tint(new THREE.BoxGeometry(1.2, 2.4, 1.2).translate(x * table * 0.36, PAD_TOP + 4, z * table * 0.36), 0xd8452e, 0.04))])); // hold-down clamps
    rocketHolder.children.filter((c) => c.userData.rocket).forEach((c) => rocketHolder.remove(c));
    rocket.userData.rocket = true;
    rocketHolder.add(rocket);
    rocketY = 0; speed = 0; debt = 0; sparked = false; lastShot = -1;
    puffs.forEach((q) => { q.age = 9; }); bits.forEach((b) => { b.age = 9; });
    flame.scale.set(height * 0.085, height * 1.05, height * 0.085);
    update(0, 0, false);
  }

  // t = seconds since the shot began. launch = false keeps the rocket on the pad (cancelled missions).
  // idle = true is the pre-launch review: the rocket waits while the camera circles it up close.
  function update(t, dt, launch, idle = false) {
    time.value += dt;
    if (idle) turn += dt * 0.06;
    near += ((idle ? 1 : 0) - near) * Math.min(1, dt * (idle ? 2.5 : 1.1));
    birds.rotation.y += dt * 0.09;
    birds.children.forEach((b, i) => { b.scale.y = 1 + Math.sin(time.value * 7 + i) * 0.45; }); // flapping
    const lit = launch && t > T_IGNITE;
    if (launch && t > T_RELEASE) { speed += dt * (6 + height * 0.16); rocketY += speed * dt; }
    rocketHolder.position.set(0, baseY + rocketY, 0);
    arms.forEach((arm, i) => { arm.rotation.y = launch ? smooth(T_IGNITE - 0.9 + i * 0.12, T_RELEASE - 0.1, t) * 1.25 : 0; });

    flame.visible = lit;
    fire.intensity = lit ? 700 : 0;
    if (lit) flame.children.forEach((c, i) => { c.scale.set(1, 0.8 + rnd() * 0.4, 1); c.rotation.y += dt * (3 + i * 2); });

    // Burst of sparks and a dust ring at the moment of ignition.
    if (lit && !sparked) {
      sparked = true;
      bits.forEach((b) => { const a = rnd() * 6.3, s = 18 + rnd() * 50; b.p.set(0, baseY, 0); b.v.set(Math.cos(a) * s, 6 + rnd() * 34, Math.sin(a) * s); b.age = 0; });
    }
    const since = t - T_IGNITE;
    dust.visible = lit && since < 2;
    if (dust.visible) { dust.scale.setScalar(12 + since * height * 2.2); dust.material.opacity = 0.55 * (1 - since / 2); }
    bits.forEach((b, i) => {
      if (b.age > 1.6) return hide(sparks, i);
      b.age += dt; b.v.y -= dt * 40; b.p.addScaledVector(b.v, dt);
      if (b.p.y < PAD_TOP) { b.p.y = PAD_TOP; b.v.y *= -0.35; }
      dummy.position.copy(b.p); dummy.scale.setScalar(height * 0.012 * Math.max(0, 1 - b.age / 1.6)); dummy.rotation.set(b.age * 9, b.age * 7, 0); dummy.updateMatrix();
      return sparks.setMatrixAt(i, dummy.matrix);
    });
    sparks.instanceMatrix.needsUpdate = true;

    // Smoke rolls out sideways along the pad at first, then hangs in a column behind the rocket.
    if (lit) {
      debt += dt * 85;
      while (debt > 1) {
        debt -= 1;
        const a = rnd() * Math.PI * 2;
        if (rocketY < height * 0.5) {
          const s = height * (0.4 + rnd() * 0.55); // smaller rockets push their smoke less far
          puff(tmp.set(Math.cos(a) * 5, baseY - 1, Math.sin(a) * 5), vel.set(Math.cos(a) * s, 1 + rnd() * 6, Math.sin(a) * s), 2.6 + rnd() * 1.4, height * (0.05 + rnd() * 0.05));
        } else {
          puff(tmp.set(Math.cos(a) * height * 0.03, baseY + rocketY - height * 0.75, Math.sin(a) * height * 0.03), vel.set(Math.cos(a) * 4, -speed * 0.2, Math.sin(a) * 4), 2 + rnd(), height * (0.035 + rnd() * 0.03));
        }
      }
    }
    puffs.forEach((q, i) => {
      if (q.age >= q.life) return hide(smoke, i);
      q.age += dt;
      const k = Math.min(1, q.age / q.life);
      q.v.multiplyScalar(1 - dt * 1.1); q.v.y += dt * 3;
      q.p.addScaledVector(q.v, dt);
      if (q.p.y < PAD_TOP - 3) q.p.y = PAD_TOP - 3;
      dummy.position.copy(q.p);
      dummy.scale.setScalar(q.size * smooth(0, 0.12, k) * (1 + k * 1.3) * (1 - smooth(0.6, 1, k))); // pop in, swell, shrink away
      dummy.rotation.set(q.spin + q.age * 0.6, q.spin * 2 + q.age * 0.4, 0); dummy.updateMatrix();
      smoke.setMatrixAt(i, dummy.matrix);
      return smoke.setColorAt(i, colour.setRGB(1, 0.72, 0.42).lerp(white, smooth(0, 0.22, k))); // fire-lit, then white
    });
    smoke.instanceMatrix.needsUpdate = true; smoke.instanceColor.needsUpdate = true;

    // The sky deepens towards space as the rocket climbs.
    const k = Math.min(1, Math.max(0, (rocketY - 120) / 500)) * 0.55; // only part of the way: the cut to space finishes it
    dim.value = k;
    sky.material.uniforms.top.value.copy(SKY.top).lerp(SPACE, k);
    sky.material.uniforms.horizon.value.copy(SKY.horizon).lerp(SPACE, k * 0.8);
    scene.fog.color.copy(SKY.fog).lerp(SPACE, k * 0.8);

    // Three camera shots: a high view of the whole site for the countdown, a low close-up for
    // ignition, then a tracking shot that tilts up to follow the rocket.
    const shot = t < T_IGNITE - 1.3 ? 0 : t < T_RELEASE + 1.2 ? 1 : 2;
    const shake = lit ? Math.max(0, 1 - rocketY / (height * 7)) * height * (shot === 1 ? 0.02 : 0.012) : 0;
    const jolt = () => (rnd() - 0.5) * shake;
    let zoom = 1;
    if (shot === 0) {
      const a = 2.2 + turn + t * 0.07, r = (height * 2.4 + 170) * (1 - 0.6 * near);
      camera.position.set(Math.cos(a) * r, (height * 0.85 + 62) * (1 - 0.66 * near), Math.sin(a) * r);
      zoom = 0.85;
    } else if (shot === 1) {
      const d = height * 0.5 + 66, cx = -d * 0.58, cz = d * 0.81;
      camera.position.set(cx + jolt(), heightAt(cx, cz) + 2.4 + jolt(), cz);
      zoom = 1.12;
    } else {
      const d = height * 1.75 + 52, cx = -d * 0.6, cz = d * 0.8;
      camera.position.set(cx + jolt(), heightAt(cx, cz) + 3.4 + height * 0.05 + jolt(), cz);
      zoom = 0.9;
    }
    tmp.set(0, baseY + rocketY + height * (shot === 1 ? 0.36 : 0.5), 0);
    if (shot !== lastShot) { lastShot = shot; lookAt.copy(tmp); } else lookAt.lerp(tmp, Math.min(1, dt * 3));
    camera.lookAt(lookAt);
    camera.fov = (camera.userData.fov ?? 50) * zoom;
    camera.updateProjectionMatrix();
  }

  return { scene, camera, start, update };
}
