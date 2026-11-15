// The rules of the game. Pure arithmetic, no DOM and no three.js, so `node test/sim.test.mjs` can check it.
import { INSTRUMENTS, SOLAR, BATTERIES, POINTING, COMPUTERS, ANTENNAS, GROUND, ORBITS, ROCKETS, EVENTS, LEVELS, REAL, ROLE_IDS } from './data.js';

const BUS_KG = 45;       // the bare spacecraft body: frame, wiring, thrusters
const BUS_W = 18;        // heaters and electronics that are always on
const STRUCTURE = 1.2;   // every kg of equipment needs 0.2 kg of frame and wiring to hold it
const GB_PER_MBPS_HOUR = 0.45; // 1 Mbit/s for one hour = 0.45 GB
const BASE_MONTHS = 10;  // designing and testing the body takes this long whatever you add
const BUILD_PACE = 0.55; // parts are built side by side, so their months only partly add up
const LATE_COST = 1;     // $M for every month the team is kept waiting

const sum = (list, key) => list.reduce((t, x) => t + x[key], 0);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const n = (x) => (x >= 100 ? Math.round(x) : x >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100).toLocaleString('en-US');
const pct = (x) => Math.round(x * 100) + '%';
const WHERE = { earth: 'Earth', moon: 'the Moon', mars: 'Mars' };

export const emptyDesign = () => ({ instruments: [], solar: null, battery: null, pointing: null, computer: null, antenna: null, ground: null, orbit: null, rocket: null });
export const defaultConfig = (mission) => ({ goals: [mission.goals[0].id], level: 'standard' });

// Turn a mission plus the player's choices (which goals, how ambitious) into firm requirements.
export function resolve(mission, config = defaultConfig(mission)) {
  const level = LEVELS[config.level] ?? LEVELS.standard;
  const goals = mission.goals.filter((g) => config.goals.includes(g.id)).slice(0, level.goals);
  const chosen = goals.length ? goals : [mission.goals[0]];
  const value = {};
  for (const g of chosen) for (const id in g.value) value[id] = Math.max(value[id] ?? 0, g.value[id]);
  return {
    ...mission, levelId: config.level in LEVELS ? config.level : 'standard', chosen, value,
    goal: Math.round(sum(chosen, 'need') * level.need), budget: mission.sandbox ? mission.budget : Math.round(mission.budget * level.budget),
  };
}

// All the numbers for a design. Works on unfinished designs too (used for the live bars).
// mod lets a flight event, and the team's answer to it, change some of the numbers.
export function evaluate(d, m, mod = {}) {
  const orbit = ORBITS[d.orbit], rocket = ROCKETS[d.rocket];
  const solar = SOLAR[d.solar], batt = BATTERIES[d.battery], point = POINTING[d.pointing], comp = COMPUTERS[d.computer], ant = ANTENNAS[d.antenna], ground = GROUND[d.ground];
  // Everything that was built is paid for and launched, even an instrument that is later switched off.
  const built = [...d.instruments.map((id) => INSTRUMENTS[id]), solar, batt, point, comp, ant].filter(Boolean);
  let ids = d.instruments;
  if (mod.drop && ids.length > 1) { const hungry = [...ids].sort((a, b) => INSTRUMENTS[b].power - INSTRUMENTS[a].power)[0]; ids = ids.filter((id) => id !== hungry); }
  const inst = ids.map((id) => INSTRUMENTS[id]);

  // Schedule: late teams pay to wait. Mars only lines up with Earth every 26 months.
  const months = Math.round(BASE_MONTHS + BUILD_PACE * (sum(built, 'months') + (ground ? ground.months : 0)) + (rocket ? rocket.months : 0));
  let late = Math.max(0, months - m.deadline);
  if (late && m.window) late = Math.ceil(late / m.window) * m.window;
  const lateCost = late * LATE_COST * (m.window ? 0.5 : 1);
  const cost = sum(built, 'cost') + (rocket ? rocket.cost : 0) + (ground ? ground.cost + ground.ops * m.years : 0) + lateCost;
  const mass = Math.round(BUS_KG + STRUCTURE * sum(built, 'mass'));
  const capacity = rocket && orbit ? rocket.cap[orbit.cls] : null;

  // Power: panels only work in sunlight, and sunlight is weaker far from the Sun.
  const instW = sum(inst, 'power');
  const baseW = BUS_W + (ant ? ant.power : 0) + (point ? point.power : 0) + (comp ? comp.power : 0);
  const load = baseW + instW;
  const sunShare = orbit ? orbit.sun * (orbit.solar ?? 1) : 1;
  const gen = solar ? solar.watts * (solar.nuclear ? 1 : sunShare) * (mod.gen ?? 1) : 0;
  const alive = !!comp && gen >= baseW;
  // Not enough power for everything: instruments take turns (duty cycle).
  const duty = !alive ? 0 : gen >= load ? 1 : instW ? (gen - baseW) / instW : 1;

  // Battery: must carry the craft through the longest shadow. `rest` = instruments sleep in shadow.
  const rest = mod.rest && orbit ? orbit.sun : 1;
  const battNeed = !orbit || (solar && solar.nuclear) ? 0 : (mod.rest ? baseW : load) * orbit.eclipseH;
  const battCap = (batt ? batt.wh : 0) * (mod.batt ?? 1);
  const drain = battNeed === 0 ? 0 : battCap ? battNeed / battCap : Infinity; // share of the battery used each shadow
  const blackout = drain > 1;
  const shadow = blackout && orbit ? orbit.sun * 0.6 : 1; // reboots after every blackout waste observing time
  const battLife = blackout ? 1.5 : 1 + 10 * (1 - drain);
  const life = orbit ? Math.round(Math.min(orbit.life, battLife) * 10) / 10 : 0;

  // Data: instruments fill the memory, the antenna empties it while a ground station is listening.
  const contactH = orbit && ground ? Math.min(24, orbit.contactH * ground.contact) : 0;
  const dataGen = sum(inst, 'data') * duty * shadow * rest * (comp ? comp.compress ?? 1 : 1) * (mod.compress ?? 1);
  // A narrow beam only works if the craft can aim it.
  const aim = !ant ? 0 : ant.needs === 'fine' ? (point && point.fine ? 1 : 0.15) : ant.needs === 'steady' ? (point && point.sharp >= 1 ? 1 : 0.4) : 1;
  const downlink = ant && orbit ? ant.mbps * orbit.range * contactH * GB_PER_MBPS_HOUR * aim * (mod.down ?? 1) : 0;
  const sent = dataGen ? Math.min(1, downlink / dataGen) : 0;
  // Between contacts the data has to wait on board. What does not fit in the memory is lost.
  const gapH = orbit ? (24 - contactH) / orbit.passes : 0;
  const storeNeed = (dataGen * gapH) / 24;
  const storage = comp ? comp.storage : 0;
  const kept = storeNeed > storage ? storage / storeNeed : 1;

  // Pointing: a craft that wobbles smears pictures. Instruments that need a steady view suffer most.
  const sharp = point ? point.sharp : 0.4;
  const focus = (x) => (sharp < 1 ? 1 - x.steady * (1 - sharp) : 1 + x.steady * (sharp - 1));
  const orbitFit = orbit ? m.orbits[d.orbit] ?? 0 : 0;
  const potential = inst.reduce((t, x, i) => t + x.science * (m.value[ids[i]] ?? 0.3) * focus(x), 0) * orbitFit;
  const science = alive ? potential * duty * shadow * rest * sent * kept * (mod.quality ?? 1) : 0;
  const lifeShare = Math.min(1, life / m.years);

  return {
    cost, budget: m.budget, mass, capacity, months, deadline: m.deadline, late, lateCost,
    gen, load, baseW, instW, alive, duty, battNeed, battCap, drain, blackout, battLife, life, years: m.years, lifeShare,
    dataGen, downlink, sent, contactH, aim, storeNeed, storage, kept, sharp,
    orbitFit, potential, science, goal: m.goal, effective: (science / m.goal) * lifeShare, working: ids,
  };
}

// Each team role has a target to defend. On a real mission these margins are what the reviews argue about.
export function roleStatus(e) {
  const powerSpare = e.load ? e.gen / e.load - 1 : 0, linkSpare = e.dataGen ? e.downlink / e.dataGen - 1 : 0;
  return {
    science: { ok: e.science >= e.goal * 1.1, now: `Science is at ${pct(e.science / e.goal)} of the goal.` },
    engineer: { ok: e.alive && powerSpare >= 0.2 && e.drain <= 0.7, now: `Spare power ${pct(Math.max(-1, powerSpare))}. Battery used ${e.drain === Infinity ? 'beyond empty' : pct(e.drain)} each shadow.` },
    comms: { ok: e.dataGen > 0 && linkSpare >= 0.25 && e.kept >= 1, now: `Spare downlink ${pct(Math.max(-1, linkSpare))}. ${e.kept < 1 ? `Memory overflows: ${pct(1 - e.kept)} lost.` : 'Memory is big enough.'}` },
    manager: { ok: e.cost <= e.budget * 0.9 && e.late === 0, now: `${pct(Math.max(0, 1 - e.cost / e.budget))} of the budget in reserve. ${e.late ? `${e.late} months late.` : 'On schedule.'}` },
  };
}

// The mission's requirements, each with how it would be checked before launch.
export function requirements(e) {
  return [
    { text: `Deliver at least ${e.goal} science points a day`, ok: e.science >= e.goal, how: 'checked by simulating the mission' },
    { text: `Keep working for ${e.years} years`, ok: e.life >= e.years, how: 'checked by lifetime analysis' },
    { text: `Cost no more than $${n(e.budget)}M`, ok: e.cost <= e.budget, how: 'checked by the cost estimate' },
    { text: 'Be light enough for the rocket', ok: e.capacity !== null && e.capacity > 0 && e.mass <= e.capacity, how: 'checked by weighing the finished craft' },
    { text: `Be ready within ${e.deadline} months`, ok: e.late === 0, how: 'checked against the build schedule' },
  ];
}

// Short warnings for the live bars on the build screen.
export function computeBudgets(d, m) {
  const e = evaluate(d, m);
  const orbit = ORBITS[d.orbit], rocket = ROCKETS[d.rocket];
  const warn = {};
  if (e.cost > e.budget) warn.budget = `Over budget by $${n(e.cost - e.budget)}M. The review board will cancel the mission.`;
  if (e.late) warn.time = m.window ? `Too slow: you miss the launch window and wait ${e.late} months for the next one (costs $${n(e.lateCost)}M).` : `${e.late} months late. Waiting costs $${n(e.lateCost)}M.`;
  if (rocket && orbit && e.capacity === 0) warn.mass = `${rocket.name} cannot reach ${orbit.name} at all.`;
  else if (e.capacity !== null && e.mass > e.capacity) warn.mass = `Too heavy: ${rocket.name} can only carry ${n(e.capacity)} kg to ${orbit.name}.`;
  if (!d.solar) warn.power = 'No power source yet. Nothing will switch on.';
  else if (!d.computer) warn.power = 'No flight computer yet. The craft has no brain.';
  else if (!e.alive) warn.power = 'Not even enough power for the computer and radio.';
  else if (e.duty < 1) warn.power = `Short of power: instruments can only run ${pct(e.duty)} of the time.`;
  if (d.solar && orbit && e.blackout) warn.battery = d.battery ? 'Battery runs flat in the shadow. The spacecraft will black out every lap.' : 'No battery: the spacecraft dies every time it enters the shadow.';
  else if (e.drain > 0.7) warn.battery = 'Battery is drained deeply every lap. It will wear out early.';
  if (d.instruments.length && !d.antenna) warn.data = 'No antenna: your data can never come home.';
  else if (d.antenna && !d.ground) warn.data = 'No ground station: nobody on Earth is listening.';
  else if (d.antenna && e.aim < 1) warn.data = `${ANTENNAS[d.antenna].name} has a narrow beam, and your pointing cannot aim it. Most of the signal misses Earth.`;
  else if (d.antenna && orbit && e.dataGen && e.sent < 1) warn.data = `The link can only send ${pct(e.sent)} of the data you collect.`;
  else if (e.kept < 1) warn.data = `Memory fills up between contacts: ${pct(1 - e.kept)} of the data is lost.`;
  if (orbit && e.life < e.years) warn.life = `Will last about ${n(e.life)} years. The mission needs ${e.years}.`;
  return { ...e, warn, requirements: requirements(e), roles: roleStatus(e) };
}

// Which real NASA mission does this design most resemble?
export function matchReal(d) {
  const orbit = ORBITS[d.orbit];
  if (!orbit) return null;
  let best = null, top = 0;
  for (const r of REAL.filter((x) => x.body === orbit.body)) {
    const shared = r.uses.filter((id) => d.instruments.includes(id)).length;
    const score = shared * 2 + (r.orbits.includes(d.orbit) ? 2 : 0) - (d.instruments.length - shared) * 0.4;
    if (shared && score > top) { top = score; best = r; }
  }
  return best;
}

// Fly the mission. eventId picks the surprise ('quiet' for none) and choiceId how the team answered it.
// Returns the result and the reasons.
export function simulate(d, m, eventId = 'quiet', choiceId) {
  const orbit = ORBITS[d.orbit], rocket = ROCKETS[d.rocket];
  const base = evaluate(d, m);
  const findings = [];
  const add = (kind, title, text, tip) => findings.push({ kind, title, text, tip });
  const fail = (stage, ...finding) => {
    add('bad', ...finding);
    return { outcome: 'fail', stage, stars: 0, score: 0, points: 0, label: 'Mission failed', findings, event: null, ...base, science: 0, effective: 0, requirements: requirements({ ...base, science: 0 }), roles: roleStatus({ ...base, science: 0 }), real: null };
  };

  // 1. Things that stop the mission before any science happens.
  if (base.cost > base.budget) {
    return fail('pad', 'Cancelled on the launch pad',
      `Your mission costs $${n(base.cost)}M but the budget is $${n(base.budget)}M${base.late ? `, including $${n(base.lateCost)}M for running ${base.late} months late` : ''}. The review board cancelled it before launch.`,
      `Cut $${n(base.cost - base.budget)}M. The rocket is often the biggest single cost: a lighter spacecraft may fit a cheaper one.`);
  }
  if (base.capacity === 0) {
    return fail('launch', 'The rocket ran out of fuel',
      `${rocket.name} is not powerful enough to reach ${orbit.name}, no matter how light the spacecraft is.`,
      'Pick a bigger rocket, or a closer orbit.');
  }
  if (base.mass > base.capacity) {
    return fail('launch', 'Too heavy to reach orbit',
      `Your spacecraft weighs ${n(base.mass)} kg, but ${rocket.name} can only carry ${n(base.capacity)} kg to ${orbit.name}. It fell ${n(base.mass - base.capacity)} kg short.`,
      'Remove or shrink something heavy (big panels, radar, large battery), or pay for a bigger rocket. Farther orbits need more fuel, so the same rocket carries less.');
  }
  if (!d.computer) {
    return fail('dead', 'No brain on board', 'The spacecraft has no flight computer. It reached orbit and has no idea what to do next.', 'Every spacecraft needs a computer to run its instruments and radio.');
  }
  if (!d.solar || !base.alive) {
    return fail('dead', d.solar ? 'Not enough power to stay alive' : 'It never switched on',
      d.solar
        ? `The computer, pointing and radio alone need ${n(base.baseW)} W, but your power source only gives ${n(base.gen)} W on average at ${orbit.name}.`
        : 'You launched a spacecraft with no power source. It reached orbit perfectly and has been silent ever since.',
      'Add bigger solar wings. Remember panels make less power in orbits with long shadows, and far from the Sun.');
  }

  // 2. It flies. Apply the surprise and the team's answer to it.
  const ev = EVENTS[eventId] ?? EVENTS.quiet;
  const choice = ev.choices.find((c) => c.id === choiceId) ?? ev.choices[0];
  const e = evaluate(d, m, choice.mod);
  const names = e.working.map((id) => INSTRUMENTS[id].name);
  const point = POINTING[d.pointing];

  if (!d.instruments.length) {
    add('bad', 'No instruments on board', 'The spacecraft works perfectly and has nothing to look with. It is the most expensive paperweight in the solar system.', 'Add at least one instrument that fits the mission goal.');
  } else if (!d.antenna) {
    add('bad', 'No way to phone home', `Your instruments collected ${n(base.dataGen)} GB every day and none of it ever reached Earth, because there is no antenna.`, 'Science only counts when the data arrives. Add an antenna.');
  } else if (!d.ground) {
    add('bad', 'Nobody is listening', 'The spacecraft sent its data perfectly, but you never paid for a ground station to receive it.', 'The ground segment is part of the mission. Choose at least one ground station.');
  } else {
    if (e.duty < 1) {
      add('bad', 'Not enough power',
        `Everything together needs ${n(e.load)} W, but you only make ${n(e.gen)} W on average at ${orbit.name}${SOLAR[d.solar].nuclear ? '' : ` (sunlight ${pct(orbit.sun)} of the time${orbit.solar ? ', and weaker this far from the Sun' : ''})`}. The instruments could only run ${pct(e.duty)} of the time.`,
        'Add bigger solar wings, or remove a power-hungry instrument.');
    }
    if (e.blackout) {
      add('bad', 'Blackout in the shadow',
        d.battery
          ? `Each pass through the shadow needs ${n(e.battNeed)} Wh, but your battery only holds ${n(e.battCap)} Wh. The spacecraft went dark every lap and wasted time restarting.`
          : `With no battery, the spacecraft switched off every time ${WHERE[orbit.body]} blocked the Sun, and had to restart again and again.`,
        'Fit a battery big enough for the longest shadow. A battery that is only half emptied also lasts much longer.');
    } else if (e.drain > 0.7) {
      add('warn', 'Battery worked too hard', `The battery was emptied to ${pct(1 - e.drain)} on every lap. Deep cycles like that wear a battery out quickly.`, 'A larger battery is drained less deeply and lasts years longer.');
    }
    if (e.aim < 1) {
      add('bad', 'The beam missed Earth',
        `${ANTENNAS[d.antenna].name} sends a very narrow beam, but ${point ? point.name : 'a craft with no pointing control'} cannot aim it accurately. Only ${pct(e.aim)} of the signal arrived.`,
        ANTENNAS[d.antenna].needs === 'fine' ? 'A laser link needs star-tracker precision pointing.' : 'A dish needs reaction wheels or better to keep it aimed at Earth.');
    }
    if (e.sent < 0.995) {
      add(e.sent < 0.7 ? 'bad' : 'warn', 'Data traffic jam',
        `Your instruments made ${n(e.dataGen)} GB a day, but the link could only carry ${n(e.downlink)} GB a day from ${orbit.name} (${n(e.contactH)} hours of contact). ${pct(1 - e.sent)} of your science never reached Earth.`,
        orbit.range < 1
          ? 'Signals get much weaker over long distances. Use a faster antenna, more ground coverage, or instruments that make less data.'
          : 'Use a faster antenna, more ground stations for longer contact, or instruments that make less data.');
    }
    if (e.kept < 1) {
      add(e.kept < 0.7 ? 'bad' : 'warn', 'Memory full',
        `Between radio contacts the craft had to hold ${n(e.storeNeed)} GB, but ${COMPUTERS[d.computer].name} only stores ${n(e.storage)} GB. ${pct(1 - e.kept)} of the data was overwritten before it could be sent.`,
        'Fit a data recorder, or add ground stations so the waits between contacts are shorter.');
    }
    const shaky = e.working.filter((id) => INSTRUMENTS[id].steady >= 0.5).map((id) => INSTRUMENTS[id].name);
    if (e.sharp < 1 && shaky.length) {
      add('warn', 'Shaky pictures', `${point ? point.name : 'With no pointing control, the craft'} could not hold steady, so ${shaky.join(' and ')} gave blurred results.`, 'Reaction wheels hold instruments on target. Magnetometers do not care, but cameras do.');
    }
    if (e.orbitFit < 1) {
      add('warn', 'Orbit does not suit the job', `${orbit.name} is not ideal for this mission, so every observation was worth only ${pct(e.orbitFit)} of what it could be.`, 'Read the orbit cards again: which one gives the view this mission needs?');
    }
    const weak = e.working.filter((id) => (m.value[id] ?? 0.3) < 0.6).map((id) => INSTRUMENTS[id].name);
    if (weak.length) {
      add('warn', 'Wrong tool for the job', `${weak.join(' and ')} ${weak.length > 1 ? 'do' : 'does'} not help much with this mission goal, but still cost money, mass and power.`, 'Spend those kilograms on an instrument that fits the goal.');
    }
  }
  if (e.life < e.years) {
    const why = e.blackout ? 'the repeated blackouts wrecked the battery'
      : e.battLife < orbit.life ? 'the battery wore out from being drained deeply on every lap'
      : orbit.cls === 'leo' || orbit.cls === 'sso' ? 'the thin air at this height slowly dragged the spacecraft down'
      : 'this orbit is not stable for long';
    add('bad', 'Mission ended early', `The mission needed ${e.years} years, but the spacecraft only lasted ${n(e.life)} because ${why}.`,
      e.battLife < orbit.life ? 'Use a larger battery so it is drained less each lap.' : 'Choose a higher, more stable orbit.');
  }
  if (e.late) {
    add('warn', m.window ? 'Missed the launch window' : 'Late to the launch pad',
      m.window ? `The spacecraft took ${e.months} months to build, but the window closed after ${e.deadline}. Mars and Earth only line up every ${m.window} months, so the team waited, at a cost of $${n(e.lateCost)}M.`
        : `The spacecraft took ${e.months} months to build instead of ${e.deadline}. Keeping the team waiting cost $${n(e.lateCost)}M.`,
      'Advanced parts take longer to build and test. Simpler parts, or fewer of them, launch sooner.');
  }

  // The surprise: did the design have spare margin, and was the team's answer the best one?
  let event = null;
  if (eventId !== 'quiet' && EVENTS[eventId]) {
    const outcomes = ev.choices.map((c) => ({ c, eff: evaluate(d, m, c.mod).effective }));
    const best = outcomes.reduce((a, b) => (b.eff > a.eff + 1e-9 ? b : a));
    const absorbed = e.effective >= base.effective * 0.99;
    const wise = e.effective >= best.eff - 1e-9;
    event = { id: eventId, name: ev.name, choice: choice.id, absorbed, wise };
    add(absorbed ? 'good' : 'event', ev.name,
      `${ev.text} You chose to "${choice.label.toLowerCase()}". ${absorbed ? `You had ${ev.margin}, so the mission lost nothing.` : `That cost you ${pct(1 - e.effective / (base.effective || 1))} of your science.`}${wise ? '' : ` The other choice would have kept ${pct(best.eff / (base.effective || 1))}.`}`,
      absorbed ? 'This is why engineers always design in spare margin.' : wise ? 'You made the best of it. Real missions keep 20 to 30% spare so a surprise like this costs nothing.' : 'In a crisis, check which resource is actually short before you give something up.');
  }

  // 3. Score: the mission itself, plus points for each team role whose margin was protected.
  const eff = e.effective, saved = (e.budget - e.cost) / e.budget;
  const roles = roleStatus(e);
  const teamwork = 25 * ROLE_IDS.filter((id) => roles[id].ok).length;
  const score = Math.round(540 * Math.min(eff, 1) + 180 * clamp((eff - 1) / 0.5, 0, 1) + (eff >= 1 ? 180 * Math.min(1, saved / 0.4) : 0) + teamwork);
  const stars = eff < 0.4 ? 0 : eff < 1 ? 1 : score >= 800 ? 3 : 2;
  const label = ['Mission failed', 'Partial success', 'Mission success', 'Outstanding mission'][stars];

  if (stars >= 2) {
    add('good', 'Science delivered', `${names.join(', ')} delivered ${n(e.science)} science points a day against a goal of ${n(e.goal)}, for the full ${e.years} years.`,
      stars === 3 ? 'Now try a completely different design. There is never just one right answer.' : `For three stars, deliver more science, save more of the budget (you saved ${pct(saved)}), or protect more of the team's margins.`);
  } else if (d.instruments.length && d.antenna && d.ground) {
    add('warn', 'Short of the goal', `You delivered ${n(e.science)} science points a day for ${n(Math.min(e.life, e.years))} of ${e.years} years. The goal was ${n(e.goal)} a day.`,
      findings.length ? 'Fix the problems above first: they are costing you the most.' : 'You need more or better-suited instruments, and the power, data and rocket to support them.');
  }
  if (stars >= 2 && saved > 0.25) add('good', 'Money well saved', `You finished $${n(e.budget - e.cost)}M under budget. Cheap missions get to fly again.`);

  const order = { bad: 0, event: 1, warn: 2, good: 3 };
  findings.sort((a, b) => order[a.kind] - order[b.kind]);
  return {
    outcome: stars === 0 ? 'fail' : stars === 1 ? 'partial' : 'success', stage: 'orbit', stars, score, teamwork, label, findings, event,
    points: Math.round(score * (LEVELS[m.levelId] ?? LEVELS.standard).points), ...e, requirements: requirements(e), roles, real: matchReal(d),
  };
}
