// Downloads the planet textures the game uses. Run with: node assets/fetch.mjs
// Sources:
//  - Earth day map and launch-region photo: NASA GIBS (gibs.earthdata.nasa.gov), public NASA imagery.
//  - Earth city lights, clouds, relief and water maps, and the Moon map: the three.js example textures,
//    which are made from NASA Blue Marble and NASA lunar imagery (three.js is MIT licensed).
//  - Mars map: github.com/nasa/NASA-3D-Resources
//    (NASA media, free to use; see NASA's media usage guidelines).
import { writeFile } from 'node:fs/promises';

const THREE_TEX = 'https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/';
const GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&STYLES=&SRS=EPSG:4326&FORMAT=image/jpeg';
const REPO = 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/';
const repo = (path) => REPO + path.split('/').map(encodeURIComponent).join('/');
const FILES = {
  // 8K Blue Marble, and a real photo of the launch region (Suomi NPP satellite, 18 April 2023), both from NASA GIBS.
  // The photo is then shrunk with: sips -Z 6144 -s format jpeg -s formatOptions 55
  'earth.jpg': GIBS + '&LAYERS=BlueMarble_NextGeneration&BBOX=-180,-90,180,90&WIDTH=8192&HEIGHT=4096',
  'earth-launch.jpg': GIBS + '&LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor&TIME=2023-04-18&BBOX=-115,-5,-20,62&WIDTH=8192&HEIGHT=5778',
  // The same region with no clouds: Sentinel-2 cloudless 2016 by EOX (s2maps.eu), CC BY 4.0, contains modified Copernicus Sentinel data.
  'earth-ground.jpg': 'https://tiles.maps.eox.at/wms?service=WMS&request=GetMap&version=1.1.1&layers=s2cloudless&styles=&srs=EPSG:4326&format=image/jpeg&bbox=-115,-5,-20,62&width=6144&height=4333',
  // The whole Earth on the same day, clouds included. The game finds the clouds by comparing it with the cloud-free map.
  'earth-photo.jpg': GIBS + '&LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor&TIME=2023-04-18&BBOX=-180,-90,180,90&WIDTH=4096&HEIGHT=2048',
  // Real star positions: the Milky Way and faint stars (NASA Tycho star map), and the stars you can see by eye (Yale Bright Star map).
  'stars-bright.jpg': repo('Images and Textures/Yale Bright Star Map/Yale Bright Star Map.jpg'),
  'stars.jpg': repo('Images and Textures/Tycho Star Map/Tycho Star Map.jpg'),
  'earth-night.png': THREE_TEX + 'earth_lights_2048.png',
  'earth-normal.jpg': THREE_TEX + 'earth_normal_2048.jpg',
  'earth-water.jpg': THREE_TEX + 'earth_specular_2048.jpg',
  'moon.jpg': THREE_TEX + 'moon_1024.jpg',
  'mars.jpg': repo('Images and Textures/Mars/Mars.jpg'),
};

const only = process.argv.slice(2);
for (const [name, url] of Object.entries(FILES)) {
  if (only.length && !only.includes(name)) continue;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const bytes = Buffer.from(await res.arrayBuffer());
    await writeFile(new URL(name, import.meta.url), bytes);
    console.log(name, (bytes.length / 1e6).toFixed(2) + ' MB');
  } catch (err) {
    console.log(name, 'FAILED:', err.message);
  }
}
