// Run with: node test/sim.test.mjs
import assert from 'node:assert/strict';
import { MISSIONS, EVENTS, ROLE_IDS } from '../src/data.js';
import { simulate, computeBudgets, emptyDesign, resolve, matchReal } from '../src/sim.js';
import { sampleDesigns } from './explore.mjs';

const mission = (id) => MISSIONS.find((m) => m.id === id);
const has = (r, title) => r.findings.some((f) => f.title === title);

// Every goal of every mission: winnable from at least two different orbits, three stars possible,
// hard to win by accident, and "buy the best of everything" fails.
for (const base of MISSIONS.filter((x) => !x.sandbox)) {
  for (const goal of base.goals) {
    const m = resolve(base, { goals: [goal.id], level: 'standard' }), all = sampleDesigns(m, 20000);
    const winners = all.filter((x) => x.r.stars >= 2), tag = `${base.name} / ${goal.name}`;
    assert.ok(new Set(winners.map((x) => x.d.orbit)).size >= 2, `${tag}: winnable from one orbit only`);
    assert.ok(winners.length / all.length < 0.15, `${tag}: too easy (${winners.length}/${all.length})`);
    assert.ok(winners.length >= 10, `${tag}: too hard (${winners.length} winners in ${all.length})`);
    const p = m.parts, last = (list) => list.at(-1);
    const max = { instruments: p.instruments, solar: last(p.solar), battery: last(p.battery), pointing: last(p.pointing), computer: last(p.computer), antenna: last(p.antenna), ground: last(p.ground), orbit: Object.keys(m.orbits)[0], rocket: last(p.rocket) };
    assert.equal(simulate(max, m).stars, 0, `${tag}: max-everything should fail`);
  }
  assert.ok(sampleDesigns(resolve(base, { goals: base.goals.slice(0, 2).map((g) => g.id), level: 'flagship' }), 20000).some((x) => x.r.stars >= 2), `${base.name}: flagship impossible`);
}

const earth = resolve(mission('earth')), storm = resolve(mission('storm')), moon = resolve(mission('moon')), mars = resolve(mission('mars'));
const good = { instruments: ['camera', 'infrared'], solar: 'small', battery: 'small', pointing: 'wheels', computer: 'basic', antenna: 'patch', ground: 'single', orbit: 'sso', rocket: 'sparrow' };

// Choosing goals and a level changes the requirements.
assert.ok(resolve(mission('earth'), { goals: ['cities'], level: 'standard' }).goal > earth.goal);
assert.ok(resolve(mission('earth'), { goals: ['crops'], level: 'pathfinder' }).budget > earth.budget);
assert.equal(resolve(mission('earth'), { goals: ['crops', 'fires'], level: 'flagship' }).chosen.length, 2);
assert.equal(resolve(mission('earth'), { goals: ['crops', 'fires'], level: 'standard' }).chosen.length, 1);

// Two clearly different winning designs for the first mission.
assert.equal(simulate(good, earth).stars, 3);
assert.ok(simulate({ ...good, instruments: ['hires'], battery: 'medium', antenna: 'dish', orbit: 'leo' }, earth).stars >= 2);

// Each failure names its real cause.
let r = simulate({ ...good, instruments: ['hires'], antenna: 'whip' }, earth);
assert.ok(has(r, 'Data traffic jam') && r.stars === 0, 'data bottleneck');
r = simulate({ ...good, instruments: ['radar'], solar: 'large', battery: 'medium', antenna: 'dish', orbit: 'llo', rocket: 'heron' }, moon);
assert.ok(r.stage === 'launch' && has(r, 'Too heavy to reach orbit'), 'over mass');
r = simulate({ ...good, orbit: 'geo' }, storm);
assert.ok(has(r, 'The rocket ran out of fuel'), 'unreachable orbit');
r = simulate({ ...good, instruments: ['weather', 'radar'], battery: 'large', antenna: 'dish', rocket: 'heron' }, storm);
assert.ok(has(r, 'Not enough power') && r.duty < 1, 'power deficit');
r = simulate({ ...good, battery: null }, earth);
assert.ok(has(r, 'Blackout in the shadow') && has(r, 'Mission ended early'), 'no battery');
r = simulate({ ...good, instruments: ['hires', 'camera', 'infrared'], antenna: 'dish', rocket: 'heron' }, earth);
assert.ok(r.stage === 'pad' && has(r, 'Cancelled on the launch pad'), 'over budget');
assert.ok(has(simulate({ ...good, computer: null }, earth), 'No brain on board'), 'no computer');
assert.ok(has(simulate({ ...good, ground: null }, earth), 'Nobody is listening'), 'no ground station');
assert.ok(has(simulate({ ...good, pointing: 'spin' }, earth), 'Shaky pictures'), 'weak pointing');
r = simulate({ ...good, antenna: 'dish', pointing: 'spin' }, earth);
assert.ok(has(r, 'The beam missed Earth') && r.aim < 1, 'dish without steady pointing');
r = simulate({ ...good, instruments: ['radar'], solar: 'large', battery: 'large', antenna: 'laser', pointing: 'star', orbit: 'leo', rocket: 'heron' }, resolve(mission('sandbox')));
assert.ok(has(r, 'Memory full') && r.kept < 1, 'small memory');

// Ground segment: more stations mean more contact, except in geostationary orbit where one already hears you all day.
assert.ok(computeBudgets({ ...good, ground: 'network' }, earth).downlink > computeBudgets(good, earth).downlink * 2);
assert.equal(computeBudgets({ ...good, orbit: 'geo', ground: 'network' }, storm).downlink, computeBudgets({ ...good, orbit: 'geo' }, storm).downlink);

// Schedule: slow parts make the launch late and cost money. Missing a Mars window costs a whole 26 months.
const slow = { instruments: ['hires', 'radar', 'altimeter', 'spectrometer'], solar: 'rtg', battery: 'large', pointing: 'star', computer: 'smart', antenna: 'laser', ground: 'network', orbit: 'lmo', rocket: 'albatross' };
r = computeBudgets(slow, mars);
assert.ok(r.late === 26 && r.lateCost > 0 && r.warn.time, 'missed Mars window');
assert.equal(computeBudgets(good, earth).late, 0);

// Weak Mars sunlight: the same panels make less than half the power they make at Earth.
assert.ok(computeBudgets({ ...emptyDesign(), solar: 'medium', orbit: 'lmo' }, mars).gen < 0.5 * 800);
assert.equal(computeBudgets(emptyDesign(), earth).warn.power, 'No power source yet. Nothing will switch on.');

// Surprises: a design with spare margin absorbs them, a design on the edge does not.
assert.equal(simulate(good, earth, 'station').event.absorbed, false); // the flat antenna has little spare, the outage takes 25%
assert.equal(simulate({ ...good, ground: 'network' }, earth, 'station').event.absorbed, true);
// The team's answer matters: compressing harder saves data when the link is the problem...
const tight = simulate(good, earth, 'station', 'wait'), squeezed = simulate(good, earth, 'station', 'squeeze');
assert.ok(squeezed.science > tight.science && squeezed.event.wise && !tight.event.wise);
// ...and only costs quality when there was margin to spare.
assert.ok(simulate({ ...good, ground: 'network' }, earth, 'station', 'squeeze').science < simulate({ ...good, ground: 'network' }, earth, 'station', 'wait').science);
for (const id in EVENTS) for (const c of EVENTS[id].choices) assert.ok(simulate(good, earth, id, c.id).score >= 0, `event ${id}/${c.id}`);

// Team roles: each has a margin to defend, and each protected margin is worth points.
r = simulate(good, earth);
assert.deepEqual(Object.keys(r.roles), ROLE_IDS);
assert.equal(r.teamwork, 25 * ROLE_IDS.filter((id) => r.roles[id].ok).length);
assert.equal(r.requirements.length, 5);
assert.ok(r.requirements.every((q) => q.ok));

// The closest real NASA mission.
assert.equal(matchReal({ ...good, orbit: 'geo', instruments: ['weather', 'infrared'] }).name, 'GOES-16');
assert.equal(matchReal({ ...good, orbit: 'llo', instruments: ['altimeter', 'hires'] }).name, 'Lunar Reconnaissance Orbiter');
assert.equal(matchReal(emptyDesign()), null);

// Sandbox: nothing is ever over budget or late.
r = computeBudgets(slow, resolve(mission('sandbox')));
assert.ok(!r.warn.budget && !r.warn.time);

console.log('sim rules OK');
