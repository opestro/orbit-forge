// Balance helper: tries a large random sample of designs for each mission goal and prints how many win.
// Run with `node test/explore.mjs` after changing numbers in src/data.js.
import { MISSIONS } from '../src/data.js';
import { simulate, resolve } from '../src/sim.js';

// A fixed random sequence, so the sample is the same on every run.
function sampler(seed = 12345) {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

// `count` random complete designs for a resolved mission.
export function sampleDesigns(m, count = 30000) {
  const rnd = sampler(), p = m.parts, any = (list) => list[Math.floor(rnd() * list.length)], out = [];
  for (let i = 0; i < count; i++) {
    const d = {
      instruments: p.instruments.filter(() => rnd() < 0.4), solar: any(p.solar), battery: any(p.battery), pointing: any(p.pointing),
      computer: any(p.computer), antenna: any(p.antenna), ground: any(p.ground), orbit: any(Object.keys(m.orbits)), rocket: any(p.rocket),
    };
    out.push({ d, r: simulate(d, m) });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const mission of MISSIONS.filter((x) => !x.sandbox)) {
    for (const [goals, level] of [...mission.goals.map((g) => [[g.id], 'standard']), [[mission.goals[0].id, mission.goals[1].id], 'flagship'], [[mission.goals[0].id], 'pathfinder']]) {
      const m = resolve(mission, { goals, level }), all = sampleDesigns(m);
      const by = [0, 1, 2, 3].map((s) => all.filter((x) => x.r.stars === s).length);
      console.log(`\n== ${mission.name} / ${goals.join('+')} / ${level}: goal ${m.goal}, budget ${m.budget}. stars 0/1/2/3 = ${by.join('/')}`);
      for (const orbit of Object.keys(m.orbits)) {
        const here = all.filter((x) => x.d.orbit === orbit), best = here.sort((a, b) => b.r.score - a.r.score)[0], d = best.d;
        console.log(`  ${orbit}: wins=${here.filter((x) => x.r.stars >= 2).length} best=${best.r.score} (${best.r.stars}*) $${best.r.cost.toFixed(1)} ${best.r.mass}kg ${best.r.months}mo sci=${best.r.science.toFixed(1)} team=${best.r.teamwork} :: ${d.instruments.join('+')} | ${d.solar} ${d.battery} ${d.pointing} ${d.computer} | ${d.antenna} ${d.ground} | ${d.rocket}`);
      }
    }
  }
}
