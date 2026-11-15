// Everything 3D: the planets, the spacecraft you build, and the flight playback.
// Planet maps are real NASA data (see assets/fetch.mjs). Rockets, spacecraft and the launch site
// are low-poly models built in code (rockets.js, craft.js, launchsite.js).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ROCKETS } from './data.js';
import { createLaunchSite } from './launchsite.js';
import { createCraft, mesh, cyl } from './craft.js';
import { makeRocket } from './rockets.js';
import { groundMaterial, cloudMaterial, cirrusMaterial } from './earthfx.js';

const R = 5; // planet radius in scene units
const NEAR = 10; // during the climb the planet is shown this much bigger, so the rocket looks small beside it
const UP = new THREE.Vector3(0, 1, 0);
const E1 = new THREE.Vector3(0, 0, 1); // angle 0 of every orbit, in the planet's own (tilted) frame
// Cape Canaveral, Florida: 28.5 degrees north. The planet is tipped so it faces the camera at lift-off.
const SITE_LAT = 28.5 * Math.PI / 180, SITE_SPIN = -0.164;
const SITE = new THREE.Vector3(0, Math.sin(SITE_LAT), Math.cos(SITE_LAT));
const EAST = new THREE.Vector3(1, 0, 0);
const SUN = new THREE.Vector3(-0.15, 0.4, 0.9).normalize(); // lights the launch side of Earth and the climb east of it
const HOME = new THREE.Vector3(7, 5, 8); // where the spacecraft floats on the build screen
const FAR_EARTH = new THREE.Vector3(-150, 40, 90); // where Earth is, seen from the Moon or Mars
const VIEW = new THREE.Vector3(0.6, 0.4, 0.75).normalize(); // camera direction for wide shots

// Flight timeline in seconds: ground shot, powered climb seen from space, release and unfolding, cruise, time in orbit.
const T_GROUND = 11, T_CLIMB = 11, T_ASCENT = T_GROUND + T_CLIMB, T_DEPLOY = 10, T_CRUISE = 3, T_ORBIT = 13;
const ROCKET_METRES = { sparrow: 22, heron: 32, albatross: 58 }; // size on the launch pad

// ---------- small helpers ----------
const ease = (x) => x * x * (3 - 2 * x);
const ramp = (x, from, to) => ease(Math.min(1, Math.max(0, (x - from) / (to - from)))); // 0 before `from`, 1 after `to`
const backOut = (x) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);

function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.25, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function atmosphere(color, size, strength) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(R * size, 48, 32), new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) }, k: { value: strength } },
    vertexShader: 'varying vec3 n; varying vec3 v; void main(){ vec4 p = modelViewMatrix * vec4(position,1.0); n = normalize(normalMatrix * normal); v = normalize(-p.xyz); gl_Position = projectionMatrix * p; }',
    fragmentShader: 'uniform vec3 c; uniform float k; varying vec3 n; varying vec3 v; void main(){ float a = pow(clamp(-dot(normalize(n), normalize(v)) / 0.5, 0.0, 1.0), 2.4); gl_FragColor = vec4(c, a * k); }',
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  return m;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Glow: anything brighter than white (flames, lamps, the Sun) bleeds light around itself.
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
  composer.addPass(renderPass);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 1.8));
  composer.addPass(new OutputPass());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1200);
  const look = new THREE.Vector3(); // what the camera looks at when the player is not steering it
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enablePan: false, enableDamping: true, minDistance: 4, maxDistance: 16, autoRotate: !reduceMotion, autoRotateSpeed: 0.7, enabled: false });
  controls.target.copy(HOME);
  canvas.addEventListener('pointerdown', () => { controls.autoRotate = false; });

  // ---------- sky and light ----------
  // The real night sky in two layers: the faint glow of the Milky Way (NASA Tycho star map), and in
  // front of it the stars you can see by eye (Yale Bright Star map).
  const starLayer = (file, radius, brightness) => {
    const map = new THREE.TextureLoader().load(`assets/${file}`);
    map.colorSpace = THREE.SRGBColorSpace;
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), new THREE.MeshBasicMaterial({ map, color: new THREE.Color(brightness, brightness, brightness * 1.06), side: THREE.BackSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending })));
  };
  starLayer('stars.jpg', 620, 0.6);
  starLayer('stars-bright.jpg', 600, 0.75); // kept dim: beside a sunlit planet, real stars are faint
  const sunLight = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sunLight.position.copy(SUN).multiplyScalar(100);
  scene.add(sunLight, new THREE.HemisphereLight(0x3fd0d8, 0x40205a, 0.28));
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,1)', 'rgba(255,190,110,0.55)'), blending: THREE.AdditiveBlending, depthWrite: false }));
  sunGlow.position.copy(SUN).multiplyScalar(450); sunGlow.scale.setScalar(190);
  scene.add(sunGlow);

  // ---------- planets ----------
  const loader = new THREE.TextureLoader();
  const tex = (file, colour = true) => {
    const t = loader.load(`assets/${file}`);
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  const sphere = new THREE.SphereGeometry(R, 128, 96);
  const tilt = new THREE.Group();   // tips the planet so the launch site faces the camera
  const planet = new THREE.Group(); // spins inside the tilt
  tilt.rotation.x = SITE_LAT;
  tilt.add(planet);
  const moonMap = tex('moon.jpg'), marsMap = tex('mars.jpg');
  const bodies = {
    // Oceans are shiny, land is not: the "water" map tells the material which is which.
    earth: mesh(sphere, new THREE.MeshPhongMaterial({ map: tex('earth.jpg'), normalMap: tex('earth-normal.jpg', false), normalScale: new THREE.Vector2(0.9, -0.9), specularMap: tex('earth-water.jpg', false), specular: 0x4a5a66, shininess: 22 })),
    moon: mesh(sphere, new THREE.MeshStandardMaterial({ map: moonMap, bumpMap: moonMap, bumpScale: 2.5, roughness: 1, metalness: 0 })),
    mars: mesh(sphere, new THREE.MeshStandardMaterial({ map: marsMap, bumpMap: marsMap, bumpScale: 2, roughness: 0.95, metalness: 0 })),
  };
  planet.add(bodies.earth, bodies.moon, bodies.mars);
  // Close-up Earth for the climb. Ground: Sentinel-2 cloud-free map. Clouds: found from a real photo of
  // 18 April 2023 (NASA Suomi NPP) and drawn on two shells above the ground, plus a thin high layer.
  const VIEW_BOX = { west: -115, east: -20, south: -5, north: 62 }, DEG = Math.PI / 180;
  const AXIS = new THREE.Vector3(0, Math.cos(SITE_LAT), Math.sin(SITE_LAT)); // the north pole, after the tilt
  const time = { value: 0 };
  const regionBox = [VIEW_BOX.west * DEG, VIEW_BOX.south * DEG, VIEW_BOX.east * DEG, VIEW_BOX.north * DEG];
  const regionMaps = { ground: tex('earth-ground.jpg'), photo: tex('earth-launch.jpg') };
  const piece = (radius, material, order) => {
    const m = mesh(new THREE.SphereGeometry(R * radius, 128, 96, 2 * Math.PI * (0.5 + VIEW_BOX.west / 360), (VIEW_BOX.east - VIEW_BOX.west) * DEG, (90 - VIEW_BOX.north) * DEG, (VIEW_BOX.north - VIEW_BOX.south) * DEG), material);
    m.renderOrder = order;
    return m;
  };
  const closeUp = new THREE.Group().add(
    piece(1.0006, groundMaterial(regionMaps, SUN, AXIS, regionBox), 1),
    piece(1.0018, cloudMaterial(regionMaps, SUN, AXIS, regionBox, { lo: 0.1, hi: 0.42, opacity: 0.95, regional: true }), 2),   // every cloud
    piece(1.0042, cloudMaterial(regionMaps, SUN, AXIS, regionBox, { lo: 0.36, hi: 0.72, opacity: 0.9, regional: true }), 3),   // tall, thick clouds only
    piece(1.0075, cirrusMaterial(SUN, time, true), 4),
  );
  closeUp.visible = false;
  planet.add(closeUp);
  // City lights, only visible on the night side.
  const lights = mesh(new THREE.SphereGeometry(R * 1.002, 96, 64), new THREE.ShaderMaterial({
    uniforms: { map: { value: tex('earth-night.png') }, sun: { value: SUN } },
    vertexShader: 'varying vec2 u; varying vec3 n; void main(){ u = uv; n = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform vec3 sun; varying vec2 u; varying vec3 n; void main(){ float night = smoothstep(0.08, -0.25, dot(normalize(n), sun)); vec3 c = texture2D(map, u).rgb; gl_FragColor = vec4(c * vec3(1.0, 0.82, 0.5) * 1.6, night); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  planet.add(lights);
  const globeMaps = { ground: bodies.earth.material.map, photo: tex('earth-photo.jpg') };
  const globeBox = [-Math.PI, -Math.PI / 2, Math.PI, Math.PI / 2];
  const shell = (radius, options, order) => { const m = mesh(new THREE.SphereGeometry(R * radius, 128, 96), cloudMaterial(globeMaps, SUN, AXIS, globeBox, options)); m.renderOrder = order; return m; };
  const clouds = new THREE.Group().add(shell(1.008, { lo: 0.16, hi: 0.85, opacity: 0.9, kGround: 1.6, gain: 1.25 }, 2), shell(1.017, { lo: 0.5, hi: 1.0, opacity: 0.8, kGround: 1.6, gain: 1.25 }, 3));
  tilt.add(clouds);
  const air = { earth: atmosphere(0x35a8ff, 1.09, 1.0), mars: atmosphere(0xff9a5c, 1.07, 0.6) };
  // Seen from close up, the air is only a thin blue line on the horizon.
  const thinAir = atmosphere(0x6fb8ff, 1.022, 1.5);
  thinAir.scale.setScalar(NEAR); thinAir.visible = false;
  scene.add(thinAir);
  scene.add(tilt, air.earth, air.mars);
  // A marker for the ground station, stuck to the planet so it turns with it.
  const station = mesh(new THREE.ConeGeometry(0.09, 0.3, 12), new THREE.MeshBasicMaterial({ color: 0x5dffd0 }));
  planet.add(station);
  const farEarth = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(190,235,255,1)', 'rgba(40,150,255,0.6)'), blending: THREE.AdditiveBlending, depthWrite: false }));
  farEarth.position.copy(FAR_EARTH); farEarth.scale.setScalar(9);
  scene.add(farEarth);

  let body = 'earth';
  function setBody(id) {
    body = id;
    for (const k in bodies) bodies[k].visible = k === id;
    clouds.visible = lights.visible = air.earth.visible = id === 'earth';
    air.mars.visible = id === 'mars';
    farEarth.visible = id !== 'earth';
    station.visible = false;
  }

  // Close-up mode for the climb: a huge Earth with the sharp launch photo and a thin atmosphere.
  function setNear(on) {
    tilt.scale.setScalar(on ? NEAR : 1);
    closeUp.visible = thinAir.visible = on;
    if (body === 'earth') clouds.visible = air.earth.visible = !on; // the close-up has its own, sharper cloud layers
  }

  // ---------- orbit ring ----------
  const e2 = new THREE.Vector3();
  let orbitR = R * 1.3;
  const ring = new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(129 * 3), 3)),
    new THREE.LineBasicMaterial({ color: 0x5dffd0, transparent: true, opacity: 0.55 }));
  ring.visible = false;
  tilt.add(ring);
  // A point on a circle in the planet's own frame (a, b = the two directions that span the circle).
  const circle = (theta, r, a, b, out) => out.copy(a).multiplyScalar(Math.cos(theta) * r).addScaledVector(b, Math.sin(theta) * r);
  // The same point on the current orbit, in world space (the planet is tipped over).
  const orbitPoint = (theta, r, out) => circle(theta, r, E1, e2, out).applyQuaternion(tilt.quaternion);
  function setOrbit(orbit) {
    ring.visible = !!orbit;
    if (!orbit) return;
    // Tilt the orbit around the launch direction: 0 = around the equator, 1.5 = over the poles.
    const normal = new THREE.Vector3(Math.sin(orbit.tilt), Math.cos(orbit.tilt), 0);
    e2.crossVectors(normal, E1).normalize();
    orbitR = R * orbit.r;
    const p = ring.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < 129; i++) circle((i / 128) * Math.PI * 2, orbitR, E1, e2, v).toArray(p.array, i * 3);
    p.needsUpdate = true;
  }

  // ---------- spacecraft (parts are built in craft.js) ----------
  const { craft, led, BUILD, setDim } = createCraft(renderer);
  craft.position.copy(HOME);
  scene.add(craft);

  const mounted = {}; // slot -> { id, group }
  const pops = [];    // parts that are still growing in
  function mount(slot, id, build) {
    const cur = mounted[slot];
    if ((cur ? cur.id : null) === (id ?? null)) return;
    if (cur) { craft.remove(cur.group); delete mounted[slot]; }
    if (!id) return;
    const group = build(id);
    craft.add(group);
    mounted[slot] = { id, group };
    if (!reduceMotion) { group.scale.setScalar(0.01); group.userData.deploy?.(0); pops.push({ group, t: 0 }); }
  }
  function setDesign(d, orbit) {
    mount('solar', d.solar, BUILD.solar);
    mount('battery', d.battery, BUILD.battery);
    mount('antenna', d.antenna, BUILD.antenna);
    mount('pointing', d.pointing, BUILD.pointing);
    mount('computer', d.computer, BUILD.computer);
    for (const id of ['camera', 'hires', 'infrared', 'weather', 'radar', 'spectrometer', 'altimeter', 'magnetometer']) {
      mount(id, d.instruments.includes(id) ? id : null, BUILD[id]);
    }
    setOrbit(orbit);
  }
  // 0 = everything folded for launch, 1 = fully unfolded.
  const setDeploy = (k) => { for (const slot in mounted) mounted[slot].group.userData.deploy?.(k); };

  // ---------- rocket, flame, explosion, data beam ----------
  const rocket = new THREE.Group();
  // Engine plume: three nested cones, white-hot in the middle and see-through at the edge. Colours above 1 glow.
  const flame = new THREE.Group();
  [[1, 1, 3.2, 0.9, 0.15, 0.45], [0.6, 0.72, 4.2, 2.2, 0.5, 0.7], [0.3, 0.42, 5, 4.6, 3.4, 1]].forEach(([w, l, r, g, b, opacity]) => {
    flame.add(new THREE.Mesh(new THREE.ConeGeometry(w, l, 8, 1, true).rotateX(Math.PI).translate(0, -l / 2, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  });
  const flameGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,250,220,1)', 'rgba(255,140,40,0.7)'), blending: THREE.AdditiveBlending, depthWrite: false }));
  // Fire is drawn after the cloud layers, or clouds behind it would paint over it.
  flame.children.forEach((c) => { c.renderOrder = 10; }); flameGlow.renderOrder = 10;
  rocket.visible = false;
  scene.add(rocket);

  const site = createLaunchSite();

  const boom = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,240,1)', 'rgba(255,120,40,0.8)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  boom.visible = false; boom.renderOrder = 10;
  scene.add(boom);

  const beam = mesh(cyl(1, 1, 1, 8), new THREE.MeshBasicMaterial({ color: 0x5dffd0, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  const packets = Array.from({ length: 5 }, () => mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xeafffa })));
  beam.visible = false;
  scene.add(beam, ...packets);
  packets.forEach((p) => { p.visible = false; });

  // ---------- camera moves ----------
  let tween = null;
  function flyTo(pos, target, seconds, then) {
    controls.enabled = false;
    tween = { p0: camera.position.clone(), p1: pos.clone(), l0: look.clone(), l1: target.clone(), t: 0, d: reduceMotion ? 0.01 : seconds, then };
  }

  let mode = 'menu', flight = null, paused = false; // paused: the flight waits while the team decides something
  function setMode(next) {
    mode = next; flight = null; paused = false; controls.enabled = false;
    setNear(false); camera.up.set(0, 1, 0);
    rocket.visible = boom.visible = beam.visible = station.visible = false;
    packets.forEach((p) => { p.visible = false; });
    setDim(1); setDeploy(1); led.visible = true;
    craft.visible = next === 'build';
    craft.position.copy(HOME); craft.scale.setScalar(1); craft.rotation.set(0, 0, 0);
    if (next === 'title') flyTo(new THREE.Vector3(0.66, 0.1, 0.74).normalize().multiplyScalar(9.4), new THREE.Vector3(0, 7, 0), 2.4); // low over the horizon
    if (next === 'menu') flyTo(VIEW.clone().multiplyScalar(17), new THREE.Vector3(0, -1.2, 0), 1.8);
    if (next === 'build') flyTo(HOME.clone().add(new THREE.Vector3(2.2, 1.4, 6.8)), HOME, 1.4, () => { controls.target.copy(HOME); controls.enabled = true; });
  }

  // The pre-launch review: the chosen rocket waiting on the pad.
  function showPad(rocketId) {
    setMode('pad');
    site.start(makeRocket(rocketId, ROCKET_METRES[rocketId]), ROCKET_METRES[rocketId]);
  }

  // ---------- flight ----------
  // plan: { rocket, orbit, body, fail: null|'pad'|'launch'|'dead', blackout, sent 0..1, hasData, event }
  function playFlight(plan, onPhase) {
    return new Promise((done) => {
      setMode('flight');
      setBody('earth'); // every mission lifts off from Earth
      setNear(true);
      ring.visible = false;
      const metres = ROCKET_METRES[plan.rocket];
      site.start(makeRocket(plan.rocket, metres), metres);
      const stack = makeRocket(plan.rocket, ROCKETS[plan.rocket].height * 1.25);
      rocket.clear();
      rocket.add(stack, flame, flameGlow);
      rocket.visible = true; rocket.scale.setScalar(1);
      setDeploy(0); // folded up inside the nose cover
      planet.rotation.y = SITE_SPIN; // Florida faces the camera
      const cruise = plan.body === 'earth' ? 0 : T_CRUISE;
      flight = { plan, t: 0, said: {}, onPhase, done, cruise, tOrbit: T_ASCENT + T_DEPLOY + cruise, swapped: plan.body === 'earth', wide: false, ended: false,
        orbitT: plan.fail === 'dead' ? 6 : T_ORBIT, pos: new THREE.Vector3(), prev: new THREE.Vector3(), stack, dir: new THREE.Vector3(1, 0, 0), first: true };
      camera.position.set(-6, 3, 12.5); look.copy(E1).multiplyScalar(R); tween = null;
    });
  }
  const say = (key) => { if (!flight.said[key]) { flight.said[key] = true; flight.onPhase(key); } };
  function endFlight() {
    if (flight.ended) return;
    flight.ended = true; say('end'); flight.done();
  }
  function skip() { if (flight && !flight.ended) flight.t = flight.plan.fail === 'pad' || flight.plan.fail === 'launch' ? 99 : flight.tOrbit + flight.orbitT; }

  const onGround = () => flight && (flight.t < T_GROUND || flight.plan.fail === 'pad');
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), q = new THREE.Quaternion();
  const up = new THREE.Vector3(), axis = new THREE.Vector3(), north = new THREE.Vector3(), goal = new THREE.Vector3(), aim = new THREE.Object3D();
  function updateFlight(dt, now) {
    const f = flight, p = f.plan;
    f.t += dt;
    const t = f.t;
    // 1. On the ground: countdown, ignition, lift-off (or a cancelled launch that never leaves).
    if (onGround()) {
      site.update(t, dt, p.fail !== 'pad');
      if (p.fail === 'pad') { say('cancelled'); if (t > 5) endFlight(); return; }
      say(t < 1.2 ? 'c3' : t < 2.4 ? 'c2' : t < 3.6 ? 'c1' : t < 4.4 ? 'ignition' : t < 7.6 ? 'liftoff' : t < T_GROUND - 0.5 ? 'climb' : 'fade');
      return;
    }

    // A rocket that is too heavy falls back and is lost.
    if (p.fail === 'launch' && t >= T_ASCENT) {
      const k = (t - T_ASCENT) / 1.6;
      rocket.visible = false; boom.visible = k < 1;
      boom.position.copy(rocket.position); boom.scale.setScalar(0.5 + k * 5); boom.material.opacity = 1 - k;
      say('crash');
      if (k > 1.4) endFlight();
      return;
    }

    // 2. Seen from space with a chase camera. The rocket leans east, drops what it no longer needs,
    //    reaches orbit, lets the satellite go, and the satellite unfolds.
    if (t < T_ASCENT + T_DEPLOY) {
      const st = f.stack.userData, failing = p.fail === 'launch', tall = ROCKETS[p.rocket].height * 1.25;
      const u = Math.min(1, (t - T_GROUND) / T_CLIMB);   // 0..1 through the powered climb
      const v = Math.max(0, (t - T_ASCENT) / T_DEPLOY);  // 0..1 through coasting, release and unfolding
      const falling = failing && u > 0.5;
      const h = failing ? Math.sin(u * Math.PI) * 0.5 : ease(Math.min(1, u * 1.1));
      f.prev.copy(f.pos);
      circle(0.02 + u * 0.3 + v * T_DEPLOY * 0.01, R * NEAR * (1.025 + 0.06 * h), SITE, EAST, f.pos).applyQuaternion(tilt.quaternion);
      if (!f.first && tmp.copy(f.pos).sub(f.prev).lengthSq() > 1e-10) f.dir.copy(tmp).normalize();
      up.copy(f.pos).normalize();
      // Straight up at first, then tipping over to fly sideways.
      const lean = ramp(u, 0, 0.45);
      if (falling) rocket.rotateX(dt * 2.5);
      else rocket.quaternion.slerp(q.setFromUnitVectors(UP, axis.copy(up).multiplyScalar(1 - lean).addScaledVector(f.dir, lean).normalize()), f.first ? 1 : 0.15);
      axis.copy(UP).applyQuaternion(rocket.quaternion);

      // Staging: boosters, then the first stage, then the nose cover.
      const drop = (m, x, y, z, spin) => { m.position.x += x * dt; m.position.y += y * dt; m.position.z += z * dt; m.rotation.x += spin * dt; m.rotation.z += spin * 0.6 * dt; m.visible = m.position.length() < 9; };
      const staged = !failing && u > 0.42, bare = !failing && u > 0.68;
      if (u > 0.2 && st.boosters.length) { say('boosters'); st.boosters.forEach((b, i) => drop(b, 0, -0.55, (i ? 1 : -1) * 0.5, 0.9)); }
      if (staged) { say('staging'); drop(st.stage1, 0, -0.8, 0, 0.3); }
      if (bare) {
        say('fairing');
        [[st.fairingA, 1], [st.fairingB, -1]].forEach(([m, sx]) => { m.position.x += sx * 0.5 * dt; m.position.y -= 0.35 * dt; m.rotation.z -= sx * 0.9 * dt; m.visible = m.position.length() < 9; });
      }
      const burning = !falling && u < 0.985 && !(staged && u < 0.47); // a short pause between the stages
      const size = staged ? 0.55 : 1, base = staged ? st.upperY : 0;
      flame.visible = flameGlow.visible = burning;
      const thin = ramp(u, 0.25, 0.7); // the higher it goes, the thinner the air and the wider the plume
      flame.scale.set(st.radius * (0.9 + 0.7 * thin) * size, tall * (0.34 + Math.random() * 0.08) * size, st.radius * (0.9 + 0.7 * thin) * size);
      flame.children.forEach((c, i) => { c.rotation.y += dt * (2 + i * 2); });
      flame.position.y = base; flameGlow.position.y = base - st.radius; flameGlow.scale.setScalar(st.radius * 7 * size);

      // The satellite rides on top, folded. After release it is pushed gently ahead and turns to face the planet.
      const fit = st.radius / 0.85; // small enough to fit inside the nose cover
      const released = v > 0.2, gap = released ? (v - 0.2) * T_DEPLOY * 0.05 : 0;
      const grown = fit * (1 + 0.9 * ramp(v, 0.25, 0.9));
      rocket.position.copy(f.pos).addScaledVector(axis, -gap * 3);
      craft.visible = !failing && (bare || t >= T_ASCENT);
      craft.scale.setScalar(grown);
      craft.position.copy(f.pos).addScaledVector(axis, st.payloadY + 0.62 * fit + gap);
      if (released) { aim.position.copy(craft.position); aim.lookAt(0, 0, 0); craft.quaternion.slerp(aim.quaternion, 0.025); } else craft.quaternion.copy(rocket.quaternion);
      setDeploy(p.fail === 'dead' ? 0 : ramp(v, 0.38, 0.97));
      setDim(1); led.visible = v > 0.38 && p.fail !== 'dead';

      // Chase camera: beside and above, looking back at the rocket with the planet behind it.
      const close = ramp(v, 0.12, 0.5);
      north.crossVectors(up, f.dir).normalize();
      tmp2.copy(rocket.position).addScaledVector(axis, tall * (staged ? 0.75 : 0.5)).lerp(craft.position, close);
      const dist = (tall * 1.9 + 1.6) * (1 - close) + (fit * 11 + 0.55) * close;
      goal.copy(tmp2).addScaledVector(north, dist * 0.78).addScaledVector(up, dist * 0.42).addScaledVector(f.dir, -dist * 0.36);
      camera.up.copy(up); // keep the horizon level
      camera.position.lerp(goal, f.first ? 1 : 0.07); look.lerp(tmp2, f.first ? 1 : 0.12);
      f.first = false;

      say(falling ? 'falling' : 'space');
      if (!failing && u >= 0.985) say('coast');
      if (released) say('release');
      if (v > 0.38 && p.fail !== 'dead') say('deploy');
      if (v > 1 - 0.5 / T_DEPLOY && !f.cruise) say('fade2');
      return;
    }
    planet.rotation.y += dt * (Math.PI * 2 / 16); // in orbit, time is sped up: one "day" every 16 seconds

    // Arrived: swap to the target world once, and pull the camera back once.
    rocket.visible = false;
    if (!f.wide) {
      f.wide = true;
      setNear(false); camera.up.set(0, 1, 0); // back to the whole planet
      setDeploy(p.fail === 'dead' ? 0 : 1);
      flyTo(VIEW.clone().multiplyScalar(R * p.orbit.r * 1.7 + 8), new THREE.Vector3(), 2.2);
    }
    const inCruise = f.cruise && t >= T_ASCENT + T_DEPLOY;
    if (!f.swapped && t >= T_ASCENT + T_DEPLOY + f.cruise / 2) { f.swapped = true; setBody(p.body); }
    if (inCruise && t < f.tOrbit) { say('cruise'); craft.visible = false; return; }
    if (!f.ringed && f.swapped) { f.ringed = true; setOrbit(p.orbit); }

    // 3. In the final orbit.
    const scale = camera.position.length() * 0.03; // far bigger than real life, so you can see it
    orbitPoint(1.1 + (t - f.tOrbit) * (Math.PI * 2 / p.orbit.period), orbitR, f.pos);
    craft.visible = true; craft.position.copy(f.pos); craft.scale.setScalar(scale);

    const along = f.pos.dot(SUN);
    const inShadow = along < 0 && tmp.copy(f.pos).addScaledVector(SUN, -along).length() < R;
    f.dim = THREE.MathUtils.lerp(f.dim ?? 1, inShadow ? 0.22 : 1, 0.12);
    setDim(f.dim);

    if (p.fail === 'dead') {
      craft.rotation.x += dt * 0.7; craft.rotation.z += dt * 0.4;
      led.visible = false;
      say('dead');
    } else {
      craft.lookAt(0, 0, 0);
      const dark = inShadow && p.blackout;
      led.visible = !dark;
      say('orbit');
      if (inShadow) say(p.blackout ? 'blackout' : 'shadow');
      const tEvent = f.tOrbit + 6.5;
      if (p.event && t > tEvent) {
        say('event');
        if (p.event === 'meteor' && t < tEvent + 0.6) { boom.visible = true; boom.position.copy(f.pos); boom.scale.setScalar(scale * 6); boom.material.opacity = 1 - (t - tEvent) / 0.6; } else boom.visible = false;
        sunGlow.scale.setScalar(p.event === 'flare' && t < tEvent + 2 ? 190 + 160 * Math.sin((t - tEvent) / 2 * Math.PI) : 190);
      }
      const outage = p.event === 'station' && t > tEvent && t < tEvent + 3;

      // Data beam to the ground station (or to faraway Earth).
      let end = null;
      if (p.body === 'earth') {
        if (!station.visible) { // put the station right under the spacecraft's first pass
          station.visible = true;
          planet.worldToLocal(station.position.copy(f.pos).setLength(R + 0.12));
          station.quaternion.setFromUnitVectors(UP, tmp.copy(station.position).normalize());
        }
        station.getWorldPosition(tmp2);
        if (tmp.copy(tmp2).normalize().dot(tmp.copy(f.pos).normalize()) > 1 / p.orbit.r + 0.04) end = tmp2;
      } else {
        // Blocked when the planet sits between the spacecraft and Earth.
        tmp.copy(FAR_EARTH).sub(f.pos).normalize();
        const s = -f.pos.dot(tmp);
        if (!(s > 0 && tmp2.copy(f.pos).addScaledVector(tmp, s).length() < R)) end = tmp2.copy(f.pos).addScaledVector(tmp, 60);
      }
      const on = p.hasData && end && !dark && !outage;
      beam.visible = !!on;
      if (on) {
        const len = tmp.copy(end).sub(f.pos).length(), w = scale * (0.05 + 0.3 * p.sent);
        beam.position.copy(f.pos).lerp(end, 0.5);
        beam.quaternion.setFromUnitVectors(UP, tmp.normalize());
        beam.scale.set(w, len, w);
        beam.material.opacity = 0.3 + 0.2 * Math.sin(now * 9);
        const count = Math.max(1, Math.round(p.sent * packets.length));
        packets.forEach((pk, i) => {
          pk.visible = i < count;
          pk.position.copy(f.pos).lerp(end, (now * 0.6 + i / count) % 1);
          pk.scale.setScalar(scale * 0.13);
        });
      } else packets.forEach((pk) => { pk.visible = false; });
    }
    if (t > f.tOrbit + f.orbitT) endFlight();
  }

  // ---------- main loop ----------
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w < h ? 62 : 45; // tall phone screens need a wider view
    camera.updateProjectionMatrix();
    site.camera.aspect = w / h;
    site.camera.userData.fov = w < h ? 70 : 50; // the launch site sets the zoom of each shot itself
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05), now = clock.elapsedTime;
    if (flight && !paused) updateFlight(dt, now);
    else planet.rotation.y += dt * 0.03;
    if (mode === 'pad') site.update(0, dt, false, true);
    clouds.rotation.y = planet.rotation.y; // the clouds turn with the planet
    time.value = now;

    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.t += dt / 1.2;
      p.group.scale.setScalar(Math.max(0.01, backOut(Math.min(1, p.t / 0.33))));
      p.group.userData.deploy?.(ramp(p.t, 0.15, 1)); // then it unfolds
      if (p.t >= 1) pops.splice(i, 1);
    }
    if (mode === 'build') craft.position.y = HOME.y + (reduceMotion ? 0 : Math.sin(now * 0.8) * 0.06);

    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.d);
      const k = ease(tween.t);
      camera.position.lerpVectors(tween.p0, tween.p1, k);
      look.lerpVectors(tween.l0, tween.l1, k);
      if (tween.t === 1) { const then = tween.then; tween = null; then?.(); }
    }
    if (controls.enabled) controls.update(); else camera.lookAt(look);
    const ground = onGround() || mode === 'pad';
    renderPass.scene = ground ? site.scene : scene;
    renderPass.camera = ground ? site.camera : camera;
    composer.render();
  });

  setBody('earth');
  camera.position.copy(VIEW).multiplyScalar(26);
  setMode('title');
  const setPaused = (on) => { paused = on; };
  const patchPlan = (changes) => { if (flight) Object.assign(flight.plan, changes); }; // the team's decision changes how the rest of the flight looks
  return { setMode, setBody, setDesign, playFlight, skip, setPaused, patchPlan, showPad };
}
