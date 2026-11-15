// Realistic Earth shading, built from two real pictures of the same place:
//   ground = a cloud-free satellite map, photo = a satellite photo of one real day (clouds included).
// Wherever the photo is much whiter than the cloud-free map, there was a cloud. That gives a cloud
// mask with no extra files, which is drawn on separate shells above the ground so the clouds have
// real depth: they slide over the land as the camera moves, and they cast shadows.
import * as THREE from 'three';

const VERT = `
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main() {
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const COMMON = `
  uniform sampler2D photo; uniform sampler2D ground;
  uniform vec3 sun; uniform vec3 axis;   // direction to the Sun, and the planet's north pole (world space)
  uniform vec4 box;                      // west, south, east, north of this piece of the planet, in radians
  uniform float kGround; uniform float lo; uniform float hi; uniform float edge;
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;

  float minc(vec3 c) { return min(c.r, min(c.g, c.b)); }
  // How much cloud there is at a point of the map (0 = clear sky, 1 = thick cloud).
  float cloudAt(vec2 uv, float a, float b) {
    return smoothstep(a, b, minc(texture2D(photo, uv).rgb) - kGround * minc(texture2D(ground, uv).rgb));
  }
  // How far to move on the map to step a small distance towards the Sun (used for shadows).
  vec2 towardSun(vec3 n, float amount) {
    vec3 east = normalize(cross(axis, n)), north = cross(n, east);
    float lat = mix(box.y, box.w, vUv.y);
    return vec2(dot(sun, east) / ((box.z - box.x) * max(cos(lat), 0.2)), dot(sun, north) / (box.w - box.y)) * amount;
  }
  // Soft fade at the borders of a regional piece, so it blends into the globe underneath.
  float border() {
    if (edge < 0.5) return 1.0;
    return smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x) * smoothstep(0.0, 0.07, vUv.y) * smoothstep(1.0, 0.93, vUv.y);
  }
  // Air between the camera and the planet turns distant things pale blue, most of all near the horizon.
  vec3 haze(vec3 col, vec3 n, vec3 v, float day, float strength) {
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.6);
    return mix(col, vec3(0.36, 0.6, 1.0) * (0.12 + 0.88 * day), rim * strength);
  }`;

const base = (textures, sun, axis, box, extra) => ({
  photo: { value: textures.photo }, ground: { value: textures.ground }, sun: { value: sun }, axis: { value: axis },
  box: { value: new THREE.Vector4(...box) }, kGround: { value: 0.8 }, lo: { value: 0.1 }, hi: { value: 0.5 }, edge: { value: 0 }, ...extra,
});

// The land and sea: cloud-free map, darkened by cloud shadows, with sunlight glinting off the water.
export function groundMaterial(textures, sun, axis, box) {
  return new THREE.ShaderMaterial({
    uniforms: base(textures, sun, axis, box, { edge: { value: 1 }, height: { value: 0.004 } }),
    vertexShader: VERT,
    fragmentShader: COMMON + `
      uniform float height;
      void main() {
        vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
        vec3 col = texture2D(ground, vUv).rgb;
        float ndl = dot(n, sun), day = smoothstep(-0.08, 0.25, ndl);
        float shadow = cloudAt(vUv + towardSun(n, height / max(ndl, 0.25)), lo, hi);
        float water = smoothstep(0.015, 0.07, col.b - col.r) * (1.0 - smoothstep(0.2, 0.45, col.g));
        col *= (0.05 + 2.3 * max(ndl, 0.0)) * (1.0 - 0.6 * shadow);
        vec3 h = normalize(sun + v);
        col += vec3(1.0, 0.94, 0.82) * pow(max(dot(n, h), 0.0), 70.0) * water * 0.9 * (1.0 - shadow);
        gl_FragColor = vec4(haze(col, n, v, day, 0.65), border());
      }`,
    transparent: true, depthWrite: false,
  });
}

// One shell of clouds. `lo` and `hi` choose how thick a cloud must be to appear on this shell:
// a low shell shows every cloud, a higher shell only the tall, thick ones.
export function cloudMaterial(textures, sun, axis, box, { lo = 0.1, hi = 0.5, opacity = 1, kGround = 0.8, gain = 1.55, regional = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: base(textures, sun, axis, box, { lo: { value: lo }, hi: { value: hi }, kGround: { value: kGround }, edge: { value: regional ? 1 : 0 }, opacity: { value: opacity }, gain: { value: gain } }),
    vertexShader: VERT,
    fragmentShader: COMMON + `
      uniform float opacity; uniform float gain;
      void main() {
        float c = cloudAt(vUv, lo, hi);
        if (c < 0.02) discard;
        vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
        float ndl = dot(n, sun), day = smoothstep(-0.1, 0.3, ndl);
        float thick = cloudAt(vUv + towardSun(n, 0.006), lo, hi);       // cloud between here and the Sun
        vec3 seen = texture2D(photo, vUv).rgb;                             // the real cloud, with its own bumps and shading
        vec3 col = mix(seen / max(max(seen.r, max(seen.g, seen.b)), 0.25), vec3(1.0), 0.45) * mix(0.72, 1.0, minc(seen));
        col = mix(col, vec3(0.58, 0.64, 0.76), thick * 0.4) * (0.06 + gain * max(ndl, 0.0));
        col = mix(col * vec3(1.0, 0.66, 0.42), col, day);                  // warm light near sunset
        gl_FragColor = vec4(haze(col, n, v, day, 0.55), c * opacity * border());
      }`,
    transparent: true, depthWrite: false,
  });
}

// High, thin ice clouds. These are drawn from noise, not from the photo, and drift slowly.
export function cirrusMaterial(sun, time, regional) {
  return new THREE.ShaderMaterial({
    uniforms: { sun: { value: sun }, t: time, edge: { value: regional ? 1 : 0 } },
    vertexShader: VERT,
    fragmentShader: `
      uniform vec3 sun; uniform float t; uniform float edge;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      void main() {
        vec2 p = vUv * vec2(26.0, 70.0) + vec2(t * 0.01, 0.0);            // stretched along the wind
        float c = smoothstep(0.5, 0.82, fbm(p + fbm(p * 0.6) * 1.6));
        float fade = edge < 0.5 ? 1.0 : smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x) * smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
        float ndl = max(dot(normalize(vN), sun), 0.0);
        gl_FragColor = vec4(vec3(1.0) * (0.05 + 1.5 * ndl), c * 0.36 * fade);
      }`,
    transparent: true, depthWrite: false,
  });
}
