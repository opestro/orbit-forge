// All game content. Pure data: no DOM, no three.js, so the rules can be tested in Node.
// Units: cost = million $, mass = kg, power = watts, data = GB per day, months = time to build and test.
// The numbers are simplified to make the trade-offs clear. They are not real engineering values.

// ---------- SPACE SEGMENT: the spacecraft ----------
// steady = how much the instrument depends on the craft holding still (0 = not at all, 1 = completely).
export const INSTRUMENTS = {
  camera: {
    name: 'Pocket Camera', kind: 'Visible-light camera',
    cost: 3, mass: 12, power: 20, data: 4, science: 10, months: 2, steady: 0.5,
    learn: 'Takes ordinary colour pictures, like a phone camera with a very long trip to work.',
    quip: 'Small, cheap, cheerful. Says "cheese" in binary.',
  },
  hires: {
    name: 'Eagle Eye Telescope', kind: 'High-resolution camera',
    cost: 18, mass: 60, power: 90, data: 40, science: 40, months: 8, steady: 1,
    learn: 'A big mirror sees tiny details, but every sharp picture is a huge file, and the craft must hold perfectly still.',
    quip: 'It can read a pizza box from orbit. It also eats data plans for breakfast.',
  },
  infrared: {
    name: 'Heat Seeker', kind: 'Infrared sensor',
    cost: 8, mass: 25, power: 45, data: 8, science: 18, months: 4, steady: 0.6,
    learn: 'Sees heat instead of light, so it works at night and can measure the temperature of clouds, seas and rocks.',
    quip: 'Sees warm things. Will absolutely find your cat.',
  },
  weather: {
    name: 'Cloud Catcher', kind: 'Weather imager',
    cost: 12, mass: 40, power: 70, data: 15, science: 30, months: 6, steady: 0.5,
    learn: 'Photographs whole cloud systems again and again so forecasters can watch storms grow.',
    quip: 'Professional cloud watcher. Finally, a job for daydreamers.',
  },
  radar: {
    name: 'Thunder Radar', kind: 'Imaging radar',
    cost: 25, mass: 90, power: 300, data: 60, science: 45, months: 9, steady: 0.7,
    learn: 'Sends its own radio pulses and listens for the echo. Sees through clouds and darkness, but it is heavy and very power hungry.',
    quip: 'Shouts at the ground and listens for the echo. Drinks power like a rock band.',
  },
  spectrometer: {
    name: 'Rock Sniffer', kind: 'Spectrometer',
    cost: 7, mass: 18, power: 25, data: 2, science: 16, months: 4, steady: 0.5,
    learn: 'Splits light into colours to work out what rocks, ice and air are made of.',
    quip: 'Tells you what a rock is made of without licking it.',
  },
  altimeter: {
    name: 'Laser Ruler', kind: 'Laser altimeter',
    cost: 9, mass: 20, power: 40, data: 3, science: 20, months: 5, steady: 0.9,
    learn: 'Fires laser pulses at the ground and times the bounce to build a 3D map of mountains and craters.',
    quip: 'Measures mountains with a laser pointer. Cats on the surface will be thrilled.',
  },
  magnetometer: {
    name: 'Compass on a Stick', kind: 'Magnetometer',
    cost: 2, mass: 3, power: 3, data: 0.1, science: 6, months: 1, steady: 0,
    learn: 'Measures magnetic fields. Tiny, light, almost free to run, and it does not care where the craft points.',
    quip: 'Weighs less than your lunch. Does more science than your lunch.',
  },
};

export const SOLAR = {
  small: {
    name: 'Small Solar Wings', cost: 2, mass: 10, watts: 300, months: 1,
    learn: 'Solar panels turn sunlight into electricity. Bigger panels make more power but add mass.',
    quip: 'Enough to run a camera and a kettle. Not both.',
  },
  medium: {
    name: 'Medium Solar Wings', cost: 5, mass: 25, watts: 800, months: 2,
    learn: 'A good all-round size. Remember panels make nothing while the planet blocks the Sun.',
    quip: 'The sensible shoes of spacecraft power.',
  },
  large: {
    name: 'Giant Solar Wings', cost: 11, mass: 55, watts: 2000, months: 3,
    learn: 'Lots of power for hungry instruments. Heavy, so check your rocket can still lift everything.',
    quip: 'Wingspan of a small airliner. Parking is a nightmare.',
  },
  rtg: {
    name: 'Nuclear Battery', cost: 40, mass: 45, watts: 300, months: 10, nuclear: true,
    learn: 'An RTG turns the heat of decaying plutonium into steady electricity. It works in the dark and far from the Sun, but it is very expensive and takes a long time to approve.',
    quip: 'Warm, steady and slightly terrifying. Works with the lights off.',
  },
};

export const BATTERIES = {
  small: {
    name: 'Small Battery', cost: 0.5, mass: 3, wh: 100, months: 1,
    learn: 'The battery keeps the spacecraft alive while it flies through the planet\'s shadow.',
    quip: 'About two laptop batteries. Be gentle with it.',
  },
  medium: {
    name: 'Medium Battery', cost: 1.5, mass: 10, wh: 400, months: 1,
    learn: 'A battery that is only half emptied each orbit lasts for many more years.',
    quip: 'Room to breathe. Batteries like naps too.',
  },
  large: {
    name: 'Large Battery', cost: 4, mass: 28, wh: 1200, months: 2,
    learn: 'Lots of spare energy. Barely stressed each orbit, so it wears out very slowly.',
    quip: 'Could power a small village. Or one radar.',
  },
};

// sharp = how well instruments can be held on target (1 = normal). fine = accurate enough for a laser link.
export const POINTING = {
  spin: {
    name: 'Spin and Magnets', kind: 'Basic attitude control', cost: 0.5, mass: 2, power: 3, months: 1, sharp: 0.55,
    learn: 'The craft spins like a top and steers by pushing against Earth\'s magnetic field. Cheap and light, but pictures come out smeared.',
    quip: 'Dizzy but dependable.',
  },
  wheels: {
    name: 'Reaction Wheels', kind: 'Three-axis control', cost: 4, mass: 9, power: 18, months: 3, sharp: 1,
    learn: 'Spinning wheels inside the craft: speed one up and the craft turns the other way. This holds instruments steady on a target.',
    quip: 'Turns the spacecraft by arguing with itself.',
  },
  star: {
    name: 'Star-Tracker Precision', kind: 'Precision pointing', cost: 10, mass: 14, power: 30, months: 5, sharp: 1.15, fine: true,
    learn: 'Cameras that recognise star patterns tell the craft exactly where it points. Needed for the sharpest pictures and for laser links.',
    quip: 'Navigates by the stars, like a sailor with better maths.',
  },
};

// storage = GB the craft can hold while it waits for the next contact. compress = shrinks the data it sends.
export const COMPUTERS = {
  basic: {
    name: 'Basic Flight Computer', cost: 1, mass: 2, power: 6, months: 2, storage: 6,
    learn: 'The brain of the craft. It holds a little data until the next radio contact with the ground.',
    quip: 'About as clever as a pocket calculator. Never crashes, though.',
  },
  recorder: {
    name: 'Computer + Data Recorder', cost: 4, mass: 5, power: 14, months: 3, storage: 60,
    learn: 'Adds a big memory, so data collected between radio contacts is not thrown away.',
    quip: 'Remembers everything. Do not tell it secrets.',
  },
  smart: {
    name: 'Smart Computer', cost: 9, mass: 6, power: 26, months: 5, storage: 120, compress: 0.6,
    learn: 'Powerful enough to squeeze the data on board, so the same science fits in 40% less to send home.',
    quip: 'Does its homework before phoning home.',
  },
};

// needs: 'steady' = must point at Earth (reaction wheels or better), 'fine' = needs precision pointing.
export const ANTENNAS = {
  whip: {
    name: 'Whip Antenna', kind: 'Low-gain antenna', cost: 1, mass: 2, power: 5, mbps: 2, months: 1,
    learn: 'Sends a weak signal in all directions. Simple and reliable, works even if the craft tumbles, but slow.',
    quip: 'Basically a car aerial. Sends data at the speed of a sleepy postcard.',
  },
  patch: {
    name: 'Flat Panel Antenna', kind: 'Medium-gain antenna', cost: 4, mass: 8, power: 25, mbps: 20, months: 2,
    learn: 'Focuses the signal into a wide beam. A solid middle choice near Earth.',
    quip: 'Like home broadband, if your home was moving at 27,000 km/h.',
  },
  dish: {
    name: 'Big Dish', kind: 'High-gain antenna', cost: 12, mass: 25, power: 60, mbps: 150, months: 4, needs: 'steady',
    learn: 'A dish squeezes the radio signal into a narrow beam, so much more data survives the long trip. The beam is narrow, so the craft must point it at Earth.',
    quip: 'The classic. Looks great in photos, talks very fast.',
  },
  laser: {
    name: 'Laser Link', kind: 'Optical communications', cost: 30, mass: 35, power: 90, mbps: 1000, months: 8, needs: 'fine',
    learn: 'Sends data on a laser beam instead of radio. Enormously fast, but costly, and the beam is so thin that only precision pointing can aim it.',
    quip: 'Space fibre. Do not point at eyes, or at anything, really.',
  },
};

// ---------- GROUND SEGMENT: the stations and people who talk to the spacecraft ----------
// contact = how many times more radio contact you get than with one station. ops = cost per year to run.
export const GROUND = {
  single: {
    name: 'One Ground Station', cost: 1, ops: 0.3, months: 2, contact: 1,
    learn: 'One dish on the ground. You can only talk while the craft is above it, which may be minutes a day.',
    quip: 'One dish, one operator, one very long coffee break between passes.',
  },
  network: {
    name: 'Station Network', cost: 5, ops: 1, months: 4, contact: 2.6,
    learn: 'Three stations around the world. As Earth turns, one of them can usually hear you, so you get much more contact time.',
    quip: 'Somebody is always awake somewhere.',
  },
  priority: {
    name: 'Round-the-Clock Coverage', cost: 14, ops: 2.5, months: 3, contact: 5,
    learn: 'Relay satellites near Earth, or booked time on the giant dishes of the Deep Space Network far away. Contact almost all day, at a price.',
    quip: 'The VIP phone line. Billed by the minute.',
  },
};

// ---------- LAUNCH SEGMENT: where it goes and what takes it there ----------
// sun = share of each orbit in sunlight, eclipseH = longest time in shadow (hours),
// contactH = hours per day ONE ground station can hear you, passes = separate contacts per day,
// range = how much signal survives the distance, life = years before the orbit itself ends the mission,
// solar = sunlight strength (Earth = 1). r / tilt / period only drive the 3D view.
export const ORBITS = {
  leo: {
    name: 'Low Earth Orbit', alt: '500 km up', body: 'earth', cls: 'leo',
    sun: 0.62, eclipseH: 0.6, contactH: 1, passes: 6, range: 1, life: 5, r: 1.22, tilt: 0.45, period: 7,
    learn: 'Very close, so pictures are sharp and the radio link is strong. But thin air slowly drags you down, you spend a third of each lap in shadow, and you only fly over a ground station for a few minutes at a time.',
    quip: 'So close you can almost smell the pizza. One lap every 95 minutes.',
  },
  sso: {
    name: 'Polar Sun-Sync Orbit', alt: '700 km up', body: 'earth', cls: 'sso',
    sun: 0.72, eclipseH: 0.45, contactH: 1.5, passes: 10, range: 1, life: 8, r: 1.3, tilt: 1.45, period: 8,
    learn: 'Flies over the poles while Earth turns below, so it sees the whole planet, always at the same local time of day. Polar ground stations hear it on every lap. Harder for the rocket to reach.',
    quip: 'Sees every place on Earth. Yes, including your house.',
  },
  geo: {
    name: 'Geostationary Orbit', alt: '35,786 km up', body: 'earth', cls: 'geo',
    sun: 0.99, eclipseH: 1.2, contactH: 24, passes: 1, range: 0.15, life: 15, r: 2.7, tilt: 0, period: 16,
    learn: 'One lap takes exactly one day, so the satellite hangs over the same spot. It can watch one side of Earth and talk to one ground station all the time, but it is far away: details are blurry, signals are weaker and the rocket must work much harder.',
    quip: 'Parks above one spot forever. The ultimate window seat.',
  },
  llo: {
    name: 'Low Lunar Orbit', alt: '100 km above the Moon', body: 'moon', cls: 'lunar',
    sun: 0.6, eclipseH: 0.8, contactH: 10, passes: 10, range: 0.02, life: 3, r: 1.25, tilt: 1.3, period: 7,
    learn: 'Skims the Moon for superb detail. But the Moon\'s lumpy gravity tugs the orbit out of shape, so the mission is short, and you are often in the Moon\'s shadow.',
    quip: 'Close enough to count craters. The Moon keeps trying to pull you in for a hug.',
  },
  hlo: {
    name: 'High Lunar Orbit', alt: '5,000 km above the Moon', body: 'moon', cls: 'lunar',
    sun: 0.9, eclipseH: 0.3, contactH: 14, passes: 3, range: 0.02, life: 12, r: 2.1, tilt: 0.9, period: 12,
    learn: 'A calm, stable orbit with lots of sunlight and long views of Earth for sending data. The price is blurrier pictures from far away.',
    quip: 'Relaxed, sunny, great view. The retirement villa of lunar orbits.',
  },
  lmo: {
    name: 'Low Mars Orbit', alt: '300 km above Mars', body: 'mars', cls: 'mars',
    sun: 0.62, eclipseH: 0.7, contactH: 8, passes: 8, range: 0.004, life: 10, solar: 0.43, r: 1.25, tilt: 1.35, period: 7,
    learn: 'Close to Mars for detailed maps. Sunlight here is less than half as strong as at Earth, and Earth is so far away that only a trickle of data survives the trip.',
    quip: 'Fantastic views. Terrible Wi-Fi.',
  },
  hmo: {
    name: 'High Mars Orbit', alt: 'Long looping ellipse', body: 'mars', cls: 'mars',
    sun: 0.9, eclipseH: 0.3, contactH: 14, passes: 2, range: 0.004, life: 12, solar: 0.43, r: 2.2, tilt: 0.7, period: 12,
    learn: 'Swings far out from Mars. Almost always in sunlight and in view of Earth for longer, but the planet is far below for most of each lap.',
    quip: 'More sunbathing, more phone time, fewer close-ups.',
  },
};

// cap = most mass (kg) the rocket can deliver to each kind of orbit. 0 = cannot reach it.
export const ROCKETS = {
  sparrow: {
    name: 'Sparrow', kind: 'Small launcher', cost: 8, height: 1, months: 2,
    real: 'Real small launchers like this, such as Electron, are about 18 metres tall.',
    cap: { leo: 300, sso: 200, geo: 0, lunar: 0, mars: 0 },
    learn: 'Cheap and small. Fine for a light satellite close to Earth. It cannot reach high orbits at all.',
    quip: 'Small, eager, slightly nervous. Low orbits only.',
  },
  heron: {
    name: 'Heron', kind: 'Medium launcher', cost: 30, height: 1.5, months: 4,
    real: 'Real medium launchers like this, such as Atlas V, add strap-on boosters for extra push.',
    cap: { leo: 1500, sso: 1100, geo: 350, lunar: 250, mars: 150 },
    learn: 'Can go anywhere, but the farther the trip, the less it can carry. Every extra kilometre costs fuel.',
    quip: 'Goes anywhere if you pack light. Very light.',
  },
  albatross: {
    name: 'Albatross', kind: 'Heavy launcher', cost: 90, height: 2.1, months: 7,
    real: 'Modelled on Moon rockets like Saturn V, which stood 110 metres tall.',
    cap: { leo: 8000, sso: 6000, geo: 2500, lunar: 1800, mars: 1200 },
    learn: 'Lifts almost anything almost anywhere. It also eats most of a mission budget on its own.',
    quip: 'Lifts a whale to Mars. Charges like one too.',
  },
};

// ---------- USER SEGMENT and missions ----------
// Each mission offers science goals. A goal says who needs the data, how much they need (need = science
// points a day), and how useful each instrument is for it (anything not listed counts 0.3).
// orbits = how well each allowed orbit suits the job. deadline = months until the launch window.
export const MISSIONS = [
  {
    id: 'earth', name: 'Earth Watcher', level: 'Training flight', body: 'earth',
    brief: 'People on the ground need fresh pictures of Earth. Build a small satellite that takes them and gets them home.',
    budget: 54, years: 4, deadline: 26,
    goals: [
      { id: 'crops', name: 'Watch farms and forests', user: 'Farmers and foresters', need: 22, value: { camera: 1, hires: 1, infrared: 0.7 }, text: 'Colour pictures of every field, every few days.' },
      { id: 'fires', name: 'Spot wildfires early', user: 'Firefighters', need: 17, value: { infrared: 1.5, camera: 0.6, hires: 0.6 }, text: 'Heat maps that show a fire before the smoke does.' },
      { id: 'cities', name: 'Map growing cities', user: 'City planners', need: 30, value: { hires: 1.4, camera: 0.5 }, text: 'Sharp pictures that show single streets and buildings.' },
    ],
    orbits: { leo: 1, sso: 1.2 },
    parts: {
      instruments: ['camera', 'hires', 'infrared'], solar: ['small', 'medium'], battery: ['small', 'medium'],
      pointing: ['spin', 'wheels'], computer: ['basic', 'recorder'], antenna: ['whip', 'patch', 'dish'],
      ground: ['single', 'network'], rocket: ['sparrow', 'heron'],
    },
    hint: 'Start small. A picture only counts if your antenna can send it home.',
  },
  {
    id: 'storm', name: 'Storm Tracker', level: 'Standard mission', body: 'earth',
    brief: 'Hurricane season is coming. Forecasters need to watch storms grow hour by hour for years. Keep an eye on the clouds, and keep it open.',
    budget: 106, years: 7, deadline: 34,
    goals: [
      { id: 'hurricanes', name: 'Track hurricanes', user: 'Weather forecasters', need: 55, value: { weather: 1.5, infrared: 1, radar: 0.8, camera: 0.5, hires: 0.5 }, text: 'Cloud pictures of the same ocean, all day, every day.' },
      { id: 'floods', name: 'See floods through cloud', user: 'Rescue teams', need: 44, value: { radar: 1.5, weather: 0.8, infrared: 0.6 }, text: 'Radar maps of flooded land, even under storm clouds.' },
      { id: 'oceans', name: 'Measure sea temperature', user: 'Climate scientists', need: 38, value: { infrared: 1.5, weather: 1, magnetometer: 0.3 }, text: 'Warm seas feed storms. Measure the heat that drives them.' },
    ],
    orbits: { leo: 0.5, sso: 0.85, geo: 1.3 },
    parts: {
      instruments: ['camera', 'hires', 'infrared', 'weather', 'radar', 'magnetometer'], solar: ['small', 'medium', 'large'], battery: ['small', 'medium', 'large'],
      pointing: ['spin', 'wheels', 'star'], computer: ['basic', 'recorder', 'smart'], antenna: ['whip', 'patch', 'dish', 'laser'],
      ground: ['single', 'network', 'priority'], rocket: ['sparrow', 'heron', 'albatross'],
    },
    hint: 'Storms never sleep. Think about which orbit lets you stare at one place.',
  },
  {
    id: 'moon', name: 'Moon Mapper', level: 'Hard mission', body: 'moon',
    brief: 'Astronauts are going back to the Moon. They need to know where it is safe to land and where the ice is hiding.',
    budget: 122, years: 3, deadline: 36,
    goals: [
      { id: 'atlas', name: 'Complete Moon atlas', user: 'Mission planners', need: 48, value: { altimeter: 1.4, spectrometer: 1.3, hires: 1, camera: 0.8, infrared: 0.8, radar: 0.9, magnetometer: 1 }, text: 'Shape, rocks and magnetism of the whole Moon.' },
      { id: 'landing', name: 'Find safe landing sites', user: 'Astronauts', need: 40, value: { altimeter: 1.5, hires: 1.2, camera: 0.8 }, text: 'Slopes and boulders measured to the metre.' },
      { id: 'ice', name: 'Find ice in dark craters', user: 'Moon base builders', need: 38, value: { spectrometer: 1.5, infrared: 1.1, radar: 1.1, altimeter: 0.7 }, text: 'Water ice is drinking water, air and rocket fuel.' },
    ],
    orbits: { llo: 1.2, hlo: 0.75 },
    parts: {
      instruments: ['camera', 'hires', 'infrared', 'radar', 'spectrometer', 'altimeter', 'magnetometer'], solar: ['small', 'medium', 'large', 'rtg'], battery: ['small', 'medium', 'large'],
      pointing: ['spin', 'wheels', 'star'], computer: ['basic', 'recorder', 'smart'], antenna: ['whip', 'patch', 'dish', 'laser'],
      ground: ['single', 'network', 'priority'], rocket: ['sparrow', 'heron', 'albatross'],
    },
    hint: 'The Moon is 1,000 times farther than low Earth orbit. Your rocket and your radio both feel it.',
  },
  {
    id: 'mars', name: 'Mars Scout', level: 'Expert mission', body: 'mars',
    brief: 'Scientists want to understand Mars. It is a seven-month trip, the sunlight is weak, and the launch window only opens every 26 months. No pressure.',
    budget: 166, years: 5, deadline: 40, window: 26,
    goals: [
      { id: 'water', name: 'Find where water flowed', user: 'Planetary scientists', need: 34, value: { spectrometer: 1.5, altimeter: 1.2, hires: 1.1, infrared: 1, camera: 0.8, radar: 1, magnetometer: 1 }, text: 'Old river beds and the minerals that water leaves behind.' },
      { id: 'weather', name: 'Forecast dust storms', user: 'Future Mars crews', need: 24, value: { infrared: 1.4, camera: 1.1, spectrometer: 0.8 }, text: 'Daily weather maps of a planet where storms can cover everything.' },
      { id: 'field', name: 'Map the lost magnetic field', user: 'Geophysicists', need: 22, value: { magnetometer: 3, spectrometer: 0.8, altimeter: 0.8 }, text: 'Mars lost its magnetic shield. The rocks still remember it.' },
    ],
    orbits: { lmo: 1.2, hmo: 0.8 },
    parts: {
      instruments: ['camera', 'hires', 'infrared', 'radar', 'spectrometer', 'altimeter', 'magnetometer'], solar: ['small', 'medium', 'large', 'rtg'], battery: ['small', 'medium', 'large'],
      pointing: ['spin', 'wheels', 'star'], computer: ['basic', 'recorder', 'smart'], antenna: ['whip', 'patch', 'dish', 'laser'],
      ground: ['single', 'network', 'priority'], rocket: ['sparrow', 'heron', 'albatross'],
    },
    hint: 'Every kilogram to Mars is precious, and data dribbles home. Choose instruments that say a lot in few bytes.',
  },
  {
    id: 'sandbox', name: 'Sandbox', level: 'Free build', body: 'earth', sandbox: true,
    brief: 'No budget, no deadline, no goal. Every part and every orbit is open. Build anything, launch it, and see what the numbers do.',
    budget: 9999, years: 3, deadline: 9999,
    goals: [{ id: 'free', name: 'Just experiment', user: 'You', need: 20, value: { camera: 1, hires: 1, infrared: 1, weather: 1, radar: 1, spectrometer: 1, altimeter: 1, magnetometer: 1 }, text: 'Every instrument counts fully.' }],
    orbits: { leo: 1, sso: 1, geo: 1, llo: 1, hlo: 1, lmo: 1, hmo: 1 },
    parts: {
      instruments: ['camera', 'hires', 'infrared', 'weather', 'radar', 'spectrometer', 'altimeter', 'magnetometer'], solar: ['small', 'medium', 'large', 'rtg'], battery: ['small', 'medium', 'large'],
      pointing: ['spin', 'wheels', 'star'], computer: ['basic', 'recorder', 'smart'], antenna: ['whip', 'patch', 'dish', 'laser'],
      ground: ['single', 'network', 'priority'], rocket: ['sparrow', 'heron', 'albatross'],
    },
    hint: 'Try the silliest design you can think of. Failing here is free.',
  },
];

// How ambitious the mission is. goals = how many science goals you take on. points = ranking multiplier.
export const LEVELS = {
  pathfinder: { name: 'Pathfinder', goals: 1, budget: 1.15, need: 0.85, points: 0.8, text: 'One goal, a generous budget and an easier target. Good for a first try.' },
  standard: { name: 'Standard', goals: 1, budget: 1, need: 1, points: 1, text: 'One goal, the normal budget and target.' },
  flagship: { name: 'Flagship', goals: 2, budget: 1.2, need: 0.85, points: 1.4, text: 'Two goals at once on one spacecraft. More money, far more to juggle.' },
};

// The four jobs on a mission team. Each owns some decisions and has its own target to defend.
export const ROLES = {
  science: { name: 'Science Lead', owns: ['instruments'], aim: 'Deliver at least 10% more science than the goal.', short: 'Science margin' },
  engineer: { name: 'Spacecraft Engineer', owns: ['solar', 'battery', 'pointing', 'computer'], aim: 'Keep 20% spare power and never drain the battery below 30%.', short: 'Power margin' },
  comms: { name: 'Communications Lead', owns: ['antenna', 'ground'], aim: 'Keep 25% spare downlink, and lose no data on board.', short: 'Link margin' },
  manager: { name: 'Mission Manager', owns: ['orbit', 'rocket'], aim: 'Keep 10% of the budget in reserve and launch on time.', short: 'Budget and schedule' },
};
export const ROLE_IDS = ['science', 'engineer', 'comms', 'manager'];

// Surprises during the flight. Each one asks the team to decide what to do. Every choice changes
// some numbers in the rules (mod). The first choice is always "carry on as designed".
export const EVENTS = {
  quiet: { name: 'Quiet skies', text: 'Nothing went wrong. In space, boring is beautiful.', choices: [{ id: 'none', mod: {} }] },
  meteor: {
    name: 'Micrometeorite strike', role: 'engineer', margin: 'spare power',
    text: 'A grain of space dust moving at 20 km/s punched through a solar panel. Power generation is down by 20%.',
    choices: [
      { id: 'share', label: 'Keep everything on', text: 'All instruments stay on and take turns if power is short.', mod: { gen: 0.8 } },
      { id: 'shed', label: 'Switch off the hungriest instrument', text: 'Lose that instrument for good, so the others can run all the time.', mod: { gen: 0.8, drop: true } },
    ],
  },
  station: {
    name: 'Ground station outage', role: 'comms', margin: 'spare downlink',
    text: 'A storm on Earth knocked out a ground station for weeks. A quarter of your contact time is gone.',
    choices: [
      { id: 'wait', label: 'Send full-quality data', text: 'Keep the files as they are. Anything that does not fit in the shorter contacts is lost.', mod: { down: 0.75 } },
      { id: 'squeeze', label: 'Compress the data harder', text: 'Files become 40% smaller, but every picture is a little worse.', mod: { down: 0.75, compress: 0.6, quality: 0.85 } },
    ],
  },
  flare: {
    name: 'Solar storm', role: 'engineer', margin: 'spare battery',
    text: 'A burst of radiation from the Sun aged your battery. It now holds 20% less energy.',
    choices: [
      { id: 'carry', label: 'Carry on as before', text: 'Instruments keep working in the shadow, on the weaker battery.', mod: { batt: 0.8 } },
      { id: 'safe', label: 'Rest the instruments in shadow', text: 'Instruments switch off whenever the Sun is hidden. Less science, but the battery is protected.', mod: { batt: 0.8, rest: true } },
    ],
  },
};

// Real NASA missions, to show players which one their design most resembles.
export const REAL = [
  { name: 'Landsat 9', body: 'earth', orbits: ['sso', 'leo'], uses: ['camera', 'hires', 'infrared'], fact: 'Launched in 2021 into a polar sun-synchronous orbit 705 km up. It carries a camera and a heat sensor, and continues a record of Earth\'s land that began in 1972.' },
  { name: 'GOES-16', body: 'earth', orbits: ['geo'], uses: ['weather', 'infrared'], fact: 'Launched in 2016 into geostationary orbit. Its imager photographs the same half of Earth every few minutes, which is how forecasters watch hurricanes grow.' },
  { name: 'Suomi NPP', body: 'earth', orbits: ['sso'], uses: ['weather', 'infrared', 'camera'], fact: 'Launched in 2011 into a polar sun-synchronous orbit. The cloud pictures of Earth in this game were taken by it.' },
  { name: 'NISAR', body: 'earth', orbits: ['sso', 'leo'], uses: ['radar'], fact: 'A radar satellite built by NASA and India\'s space agency ISRO, launched in 2025. Its radar sees the ground through cloud and at night.' },
  { name: 'Lunar Reconnaissance Orbiter', body: 'moon', orbits: ['llo'], uses: ['altimeter', 'hires', 'camera', 'infrared'], fact: 'In low orbit around the Moon since 2009. Its laser altimeter and cameras made the maps used to choose landing sites.' },
  { name: 'Lunar Prospector', body: 'moon', orbits: ['llo', 'hlo'], uses: ['spectrometer', 'magnetometer'], fact: 'A small, cheap orbiter launched in 1998. Its spectrometers found signs of water ice at the Moon\'s poles.' },
  { name: 'Mars Reconnaissance Orbiter', body: 'mars', orbits: ['lmo'], uses: ['hires', 'spectrometer', 'radar', 'camera'], fact: 'In low Mars orbit since 2006, with the sharpest camera ever sent to another planet and a big dish to send its huge pictures home.' },
  { name: 'Mars Global Surveyor', body: 'mars', orbits: ['lmo'], uses: ['altimeter', 'camera', 'magnetometer'], fact: 'Launched in 1996. Its laser altimeter measured the height of all of Mars, and its magnetometer found old magnetism frozen in the rocks.' },
  { name: 'Mars Odyssey', body: 'mars', orbits: ['lmo'], uses: ['infrared', 'spectrometer'], fact: 'Orbiting Mars since 2001, longer than any other spacecraft at another planet. Its instruments mapped heat and found buried ice.' },
  { name: 'MAVEN', body: 'mars', orbits: ['hmo'], uses: ['magnetometer', 'spectrometer'], fact: 'Launched in 2013 into a long looping orbit to study how Mars lost its air to space.' },
];

// NASA's own steps for designing a mission (from "Design and Develop Science Missions", NASA 2025).
export const STEPS = ['Need and goals', 'Concept', 'Requirements', 'Design', 'Build and verify', 'Fly'];

// Further reading: the resources NASA listed for this challenge.
export const LINKS = [
  ['Design and Develop Science Missions', 'https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf', 'NASA\'s steps and the four mission segments used in this game.'],
  ['CubeSat 101', 'https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf', 'How long each phase of a small satellite project really takes.'],
  ['Mission Design Lab', 'https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab/', 'Where NASA engineers do trade studies like the ones you do here.'],
  ['General Mission Analysis Tool (GMAT)', 'https://software.nasa.gov/software/GSC-19468-1', 'NASA\'s free software for working out real orbits.'],
  ['NASA Mission Viz', 'https://nasa.github.io/mission-viz/', '3D views of real mission paths.'],
  ['Build It Yourself: Satellite!', 'https://science.nasa.gov/mission/webb/game-build-it-yourself/', 'NASA\'s game about designing a space telescope.'],
];

// ---------- career: the player's rank and badges ----------
// Every flight earns experience (XP), even a failed one: failing is how engineers learn.
export const RANKS = [
  { xp: 0, name: 'Cadet' }, { xp: 100, name: 'Flight Controller' }, { xp: 300, name: 'Systems Engineer' },
  { xp: 600, name: 'Mission Designer' }, { xp: 1000, name: 'Flight Director' }, { xp: 1500, name: 'Chief Engineer' },
];
export const PATCH_COLOURS = ['#ff5a36', '#4dffe1', '#ffc857', '#c78bff', '#6fb1ff', '#f4f1ea'];
// test(result, { mission, level, team }) decides whether a flight earned the badge.
const won = (r) => r.stars >= 2;
export const BADGES = [
  { id: 'orbit', name: 'First light', text: 'Reach orbit and bring some science home.', test: (r) => r.stars >= 1 },
  { id: 'success', name: 'Mission success', text: 'Meet a mission goal.', test: won },
  { id: 'three', name: 'Outstanding', text: 'Earn three stars on a mission.', test: (r) => r.stars === 3 },
  { id: 'boom', name: 'Rapid unscheduled disassembly', text: 'Lose a rocket. Everyone does it once.', test: (r) => r.stage === 'launch' },
  { id: 'paper', name: 'Paper spacecraft', text: 'Get cancelled by the accountants.', test: (r) => r.stage === 'pad' },
  { id: 'thrift', name: 'Penny pincher', text: 'Succeed with 30% of the budget unspent.', test: (r) => won(r) && r.cost <= r.budget * 0.7 },
  { id: 'board', name: 'Full board', text: 'Succeed with all four margins protected.', test: (r) => won(r) && ROLE_IDS.every((id) => r.roles[id].ok) },
  { id: 'cool', name: 'Cool head', text: 'Make the best call when a surprise hits.', test: (r) => won(r) && !!r.event?.wise },
  { id: 'storm', name: 'Storm chaser', text: 'Succeed on Storm Tracker.', test: (r, c) => won(r) && c.mission === 'storm' },
  { id: 'moon', name: 'Moonstruck', text: 'Succeed at the Moon.', test: (r, c) => won(r) && c.mission === 'moon' },
  { id: 'mars', name: 'Red planet', text: 'Succeed at Mars.', test: (r, c) => won(r) && c.mission === 'mars' },
  { id: 'flagship', name: 'Flagship', text: 'Succeed with two goals on one spacecraft.', test: (r, c) => won(r) && c.level === 'flagship' },
  { id: 'crew', name: 'Crew', text: 'Succeed as a team.', test: (r, c) => won(r) && c.team },
];
