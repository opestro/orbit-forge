// Screens and game state. The rules live in sim.js, the 3D in scene.js, team rooms in net.js.
// The game follows NASA's own steps: need and goals, concept, requirements, design, build and verify, fly.
import { MISSIONS, INSTRUMENTS, SOLAR, BATTERIES, POINTING, COMPUTERS, ANTENNAS, GROUND, ORBITS, ROCKETS, EVENTS, LEVELS, ROLES, ROLE_IDS, STEPS, LINKS, RANKS, BADGES, PATCH_COLOURS } from './data.js';
import { computeBudgets, simulate, emptyDesign, resolve, defaultConfig } from './sim.js';
import { createScene } from './scene.js';
import * as net from './net.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (x) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toLocaleString('en-US');
const BODY = { earth: 'Earth', moon: 'the Moon', mars: 'Mars' };
// Small saved values (best scores, past runs, your name). Private browsing may refuse: the game still works.
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not saved */ } };

const view = createScene($('view'));
const kept = {};      // per mission: the brief choices and the design, so "try again" keeps your work
const lastRun = {};   // per mission: the previous result, to compare with the next one
let mission = null, config = null, m = null, design = null, tab = 'instruments', openBar = null;
let online = false, flying = false, flightN = 0, answer = null, shownBody = null;

// ---------- who is playing ----------
const myId = load('orbit-forge-id', null) ?? Math.random().toString(36).slice(2, 10);
save('orbit-forge-id', myId);
// The player's career: name, patch colour, experience (XP), flights and badges. Saved on this device.
const pilot = { name: '', colour: 0, xp: 0, flights: 0, badges: [], ...load('orbit-forge-pilot', {}) };
let myName = pilot.name || load('orbit-forge-name', 'Player 1');
const savePilot = () => { save('orbit-forge-pilot', pilot); myName = pilot.name || myName; save('orbit-forge-name', myName); };
const rankOf = (xp) => RANKS.findLast((r) => xp >= r.xp);
const patch = (size = '', name = pilot.name) => `<span class="patch ${size}" style="--c:${PATCH_COLOURS[pilot.colour] ?? PATCH_COLOURS[0]}" aria-hidden="true">${esc((name || '?')[0].toUpperCase())}</span>`;
// Roles are dealt round the table, so two players get two roles each and four get one each.
const dealRoles = (players) => Object.fromEntries(ROLE_IDS.map((role, i) => [role, players[i % players.length].id]));
const session = { mode: 'solo', players: [{ id: myId, name: myName }], owners: {}, me: myId, go: {}, room: null };
session.owners = dealRoles(session.players);
const playerName = (id) => session.players.find((p) => p.id === id)?.name ?? 'nobody';
const isTeam = () => session.mode !== 'solo';
const allGo = () => ROLE_IDS.every((r) => session.go[r]);

// Change something every player shares. In an online room it is sent to the others.
function commit(set) {
  if ('config' in set) config = set.config;
  if ('design' in set) design = set.design;
  if ('go' in set) session.go = set.go;
  if (mission) { m = resolve(mission, config); kept[mission.id] = { config, design }; }
  session.room?.send(set);
}

// Designs arrive from links and from other players, so keep only choices this mission really offers.
function sane(mis, c, d) {
  const p = mis.parts, one = (key, list) => (list.includes(d?.[key]) ? d[key] : null);
  const goals = (Array.isArray(c?.goals) ? c.goals : []).filter((g) => mis.goals.some((x) => x.id === g));
  return {
    config: { level: Object.hasOwn(LEVELS, c?.level) ? c.level : 'standard', goals: goals.length ? goals : [mis.goals[0].id] },
    design: {
      instruments: p.instruments.filter((id) => Array.isArray(d?.instruments) && d.instruments.includes(id)),
      solar: one('solar', p.solar), battery: one('battery', p.battery), pointing: one('pointing', p.pointing), computer: one('computer', p.computer),
      antenna: one('antenna', p.antenna), ground: one('ground', p.ground), orbit: one('orbit', Object.keys(mis.orbits)), rocket: one('rocket', p.rocket),
      name: typeof d?.name === 'string' ? d.name.slice(0, 20) : '',
    },
  };
}

// ---------- sound effects (made in code, no files) ----------
let audio = null, soundOn = true;
function beep(freq, dur = 0.08, type = 'sine', vol = 0.06, slide = 0) {
  if (!soundOn) return;
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch { /* no audio available */ }
}
// Filtered noise, for rumbles, bangs and hisses.
function rush(dur, { from = 200, to = from, vol = 0.2, attack = 0.05 } = {}) {
  if (!soundOn) return;
  try {
    audio ??= new AudioContext();
    const n = Math.floor(audio.sampleRate * dur), buffer = audio.createBuffer(1, n, audio.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = audio.createBufferSource(), filter = audio.createBiquadFilter(), g = audio.createGain(), t = audio.currentTime;
    src.buffer = buffer; filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, t); filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(audio.destination); src.start(t);
  } catch { /* no audio available */ }
}
const SFX = {
  pick: () => beep(660, 0.07, 'triangle'), drop: () => beep(330, 0.07, 'triangle'), go: () => beep(520, 0.12, 'triangle', 0.06, 780),
  launch: () => { rush(9, { from: 90, to: 700, vol: 0.5, attack: 0.5 }); beep(48, 7, 'sawtooth', 0.05, 110); },
  part: () => { rush(0.35, { from: 1400, to: 200, vol: 0.3, attack: 0.01 }); beep(120, 0.18, 'square', 0.05, 50); },
  unfold: () => [0, 1, 2, 3].forEach((i) => setTimeout(() => beep(420 + i * 90, 0.35, 'sine', 0.03, 520 + i * 90), i * 700)),
  alarm: () => [0, 1, 2].forEach((i) => setTimeout(() => beep(880, 0.16, 'square', 0.05), i * 260)),
  crash: () => { rush(1.8, { from: 900, to: 60, vol: 0.6, attack: 0.01 }); beep(160, 0.9, 'sawtooth', 0.1, 30); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.22, 'triangle', 0.07), i * 130)),
  lose: () => [330, 262, 196].forEach((f, i) => setTimeout(() => beep(f, 0.3, 'triangle', 0.07), i * 180)),
};
// Background music: a slow, quiet chord made in code. It can only start after the first click or key press.
let drone = null;
function music(on) {
  try {
    if (on && !drone) {
      audio ??= new AudioContext();
      const out = audio.createGain(), filter = audio.createBiquadFilter(), lfo = audio.createOscillator(), depth = audio.createGain();
      out.gain.value = 0; filter.type = 'lowpass'; filter.frequency.value = 520;
      filter.connect(out).connect(audio.destination);
      [[55, 0.5], [82.4, 0.32], [110, 0.24], [164.8, 0.13], [220, 0.08], [277.2, 0.04]].forEach(([freq, vol], i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = i < 2 ? 'sine' : 'triangle'; o.frequency.value = freq; o.detune.value = i % 2 ? 7 : -7; g.gain.value = vol;
        o.connect(g).connect(filter); o.start();
      });
      lfo.frequency.value = 0.06; depth.gain.value = 260; lfo.connect(depth).connect(filter.frequency); lfo.start(); // the sound slowly opens and closes
      drone = out;
    }
    drone?.gain.setTargetAtTime(on ? 0.06 : 0, audio.currentTime, 1.2);
  } catch { /* no audio available */ }
}
$('sound').onclick = (e) => {
  soundOn = !soundOn;
  music(soundOn);
  e.currentTarget.textContent = soundOn ? 'Sound on' : 'Sound off';
  e.currentTarget.setAttribute('aria-pressed', soundOn);
};

// ---------- screens ----------
const screen = () => document.body.dataset.screen;
function show(name, step = -1) {
  document.body.dataset.screen = name;
  $('steps').innerHTML = step < 0 ? '' : STEPS.map((s, i) => `<li class="${i < step ? 'done' : i === step ? 'now' : ''}">${esc(s)}</li>`).join('');
  $('pilot-chip').innerHTML = `${patch('s')}<span>${esc(pilot.name)}</span>`;
  if (name !== 'build') window.scrollTo(0, 0);
}
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function flash(kind) { const f = $('flash'); f.classList.remove('go', 'cut'); void f.offsetWidth; f.classList.add(kind); }
// Fade to dark, change the scene while it is dark, fade back.
function cutTo(change) { flash('cut'); setTimeout(change, calm ? 0 : 450); }
function starRow(count) {
  return [0, 1, 2].map((i) => `<svg class="star${i < count ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z"/></svg>`).join('');
}
const chip = (k, v) => `<span class="chip"><i>${esc(k)}</i>${esc(v)}</span>`;
const place = (mis) => (mis.sandbox ? 'Any orbit' : BODY[mis.body].replace('the ', ''));

// ---------- title and profile ----------
function start() {
  music(soundOn); SFX.go();
  if (pilot.name) toMenu(); else openProfile();
}
function openProfile() {
  $('pilot-name').value = pilot.name;
  renderProfile(); show('profile');
  $('pilot-name').focus();
}
function renderProfile() {
  const name = $('pilot-name').value.trim();
  $('swatches').innerHTML = PATCH_COLOURS.map((c, i) => `<button type="button" role="radio" aria-checked="${i === pilot.colour}" aria-label="Colour ${i + 1}" data-colour="${i}" style="--c:${c}"></button>`).join('');
  $('id-preview').innerHTML = `${patch('', name)}<div><strong>${esc(name || 'Your name')}</strong><span>${esc(rankOf(pilot.xp).name)} · Orbit Forge mission control</span></div>`;
}
$('press-start').onclick = start;
$('pilot-name').oninput = renderProfile;
$('swatches').onclick = (e) => { const b = e.target.closest('[data-colour]'); if (b) { pilot.colour = Number(b.dataset.colour); SFX.pick(); renderProfile(); } };
$('pilot-form').onsubmit = (e) => {
  e.preventDefault();
  pilot.name = $('pilot-name').value.trim().slice(0, 16) || 'Player 1';
  savePilot(); SFX.go(); toMenu();
};

// The player's rank, progress to the next rank, and totals.
function careerHTML(fromXp = pilot.xp) {
  const best = load('orbit-forge-best', {}), rank = rankOf(pilot.xp), next = RANKS[RANKS.indexOf(rank) + 1];
  const stars = MISSIONS.reduce((sum, x) => sum + (best[x.id]?.stars ?? 0), 0), total = MISSIONS.filter((x) => !x.sandbox).length * 3;
  const share = (xp) => (next ? Math.round(Math.max(0, xp - rank.xp) / (next.xp - rank.xp) * 100) : 100);
  return `<div class="id-card">${patch()}<div><strong>${esc(pilot.name)}</strong><span>${esc(rank.name)}</span></div></div>
    <div class="xp"><div class="track"><span style="width:${share(fromXp)}%" data-to="${share(pilot.xp)}"></span></div>
      <p>${pilot.xp} XP · ${next ? `${next.xp - pilot.xp} more to become ${esc(next.name)}` : 'top rank'}</p></div>
    <div class="stats"><div><b>${pilot.flights}</b><i>Flights</i></div><div><b>${stars}/${total}</b><i>Stars</i></div><div><b>${pilot.badges.length}/${BADGES.length}</b><i>Badges</i></div></div>`;
}
const badgeList = (list, extra = '') => `<ul class="badges${extra}">${list.map((b) => `<li class="${pilot.badges.includes(b.id) ? 'on' : ''}"><strong>${esc(b.name)}</strong><span>${esc(b.text)}</span></li>`).join('')}</ul>`;
function openRecord() {
  $('overlay-body').innerHTML = `<h2>Service record</h2>${careerHTML()}
    <h3>Badges <span>${pilot.badges.length} of ${BADGES.length} earned</span></h3>${badgeList(BADGES)}
    ${screen() === 'menu' ? '<div class="actions"><button class="ghost" type="button" id="edit-pilot">Change name or patch</button></div>' : ''}`;
  $('overlay').hidden = false;
}
// What a finished flight adds to the career: XP, new badges, maybe a promotion.
function career(r) {
  const before = rankOf(pilot.xp), fromXp = pilot.xp, ctx = { mission: mission.id, level: m.levelId, team: isTeam() };
  const fresh = BADGES.filter((b) => !pilot.badges.includes(b.id) && b.test(r, ctx));
  const gain = Math.max(5, Math.round(r.points / 10)) + 40 * fresh.length;
  pilot.xp += gain; pilot.flights++; pilot.badges.push(...fresh.map((b) => b.id));
  savePilot();
  const after = rankOf(pilot.xp);
  return { gain, fresh, promoted: after !== before ? after : null, fromXp: after !== before ? after.xp : fromXp };
}

// ---------- mission control: career and mission board ----------
function renderMenu() {
  const best = load('orbit-forge-best', {});
  const nextUp = MISSIONS.find((x) => !x.sandbox && (best[x.id]?.stars ?? 0) < 2);
  $('pilot-card').innerHTML = `${careerHTML()}<button class="ghost" type="button" id="open-record">Service record and badges</button>`;
  $('missions').innerHTML = MISSIONS.map((x, i) => `
    <button class="mission${x.sandbox ? ' sandbox' : ''}${x === nextUp ? ' next' : ''}" type="button" data-i="${i}">
      <span class="m-num">${x.sandbox ? 'Free' : String(i + 1).padStart(2, '0')}${x === nextUp ? '<b>Next for you</b>' : ''}</span>
      <span class="eyebrow">${esc(x.level)} · ${esc(place(x))}</span>
      <strong>${esc(x.name)}</strong>
      <span class="m-brief">${esc(x.brief)}</span>
      <span class="m-meta">${x.sandbox ? '<span>No limits</span>' : `<span>Budget $${x.budget}M</span><span>${x.years} years</span><span>${x.goals.length} goals to choose</span>`}</span>
      <span class="m-best">${x.sandbox ? '' : best[x.id] ? `${starRow(best[x.id].stars)}<span>Best ${best[x.id].score}</span>` : '<span>Not flown yet</span>'}</span>
    </button>`).join('');
  $('missions').querySelectorAll('.mission').forEach((b) => {
    const x = MISSIONS[b.dataset.i];
    b.onmouseenter = b.onfocus = () => view.setBody(x.body);
    b.onclick = () => { SFX.pick(); openBrief(x); };
  });
  $('join-form').hidden = !online;
}
function toMenu() {
  session.room?.close();
  Object.assign(session, { mode: 'solo', players: [{ id: myId, name: myName }], me: myId, go: {}, room: null });
  session.owners = dealRoles(session.players);
  mission = null; flying = false;
  if (location.hash) history.replaceState(null, '', location.pathname);
  view.setBody('earth'); view.setMode('menu'); shownBody = 'earth';
  renderMenu(); show('menu');
}

// ---------- brief: need and goals, requirements, team ----------
function openBrief(mis, fromShare) {
  mission = mis;
  ({ config, design } = fromShare ? sane(mis, fromShare.c, fromShare.d) : kept[mis.id] ?? { config: defaultConfig(mis), design: emptyDesign() });
  m = resolve(mission, config);
  view.setBody(mis.body); shownBody = mis.body;
  renderBrief(); show('brief', 0);
}

function renderBrief() {
  m = resolve(mission, config);
  const level = LEVELS[config.level], free = mission.sandbox;
  const roleLine = (r) => `<li><b>${esc(ROLES[r].name)}</b>${isTeam() ? ` <span class="who">${esc(playerName(session.owners[r]))}</span>` : ''}<span>${esc(ROLES[r].aim)}</span></li>`;
  $('brief-body').innerHTML = `
    <p class="eyebrow">${esc(mission.level)} · ${esc(place(mission))}</p>
    <h2>${esc(mission.name)}</h2>
    <p class="lede2">${esc(mission.brief)}</p>
    ${free ? '' : `
    <h3>1. Who needs this mission? Choose ${level.goals === 1 ? 'one goal' : 'two goals'}</h3>
    <p class="note">NASA starts every mission from the people who will use the data. Your goal decides which instruments are worth carrying.</p>
    <div class="picks">${mission.goals.map((g) => {
      const top = Object.entries(g.value).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => INSTRUMENTS[id].name).join(', ');
      return `<button type="button" class="card${config.goals.includes(g.id) ? ' on' : ''}" aria-pressed="${config.goals.includes(g.id)}" data-goal="${g.id}">
        <span class="card-head"><strong>${esc(g.name)}</strong></span><span class="fit f2">For: ${esc(g.user)}</span>
        <span class="learn">${esc(g.text)}</span><span class="chips">${chip('Needs', `${g.need} science a day`)}${chip('Best with', top)}</span></button>`;
    }).join('')}</div>
    <h3>2. How ambitious?</h3>
    <div class="picks">${Object.entries(LEVELS).map(([id, l]) => `<button type="button" class="card${config.level === id ? ' on' : ''}" aria-pressed="${config.level === id}" data-level="${id}">
      <span class="card-head"><strong>${esc(l.name)}</strong><span class="kind">ranking points x${l.points}</span></span><span class="learn">${esc(l.text)}</span></button>`).join('')}</div>
    <h3>3. Your requirements</h3>
    <p class="note">These follow from your choices. Before launch, each one is checked.</p>
    <ul class="reqs plain">
      <li>Deliver at least <b>${m.goal} science points a day</b> for ${m.chosen.map((g) => esc(g.user.toLowerCase())).join(' and ')}</li>
      <li>Keep working for <b>${m.years} years</b></li>
      <li>Cost no more than <b>$${m.budget}M</b>, including running the ground stations</li>
      <li>Be ready within <b>${m.deadline} months</b>${m.window ? `, or wait ${m.window} months for the next launch window` : ''}</li>
    </ul>`}
    <h3>${free ? 'Who is playing?' : '4. Who is on the team?'}</h3>
    <div class="modes">
      <button type="button" class="ghost${session.mode === 'solo' ? ' on' : ''}" data-mode="solo">Solo</button>
      <button type="button" class="ghost${session.mode === 'local' ? ' on' : ''}" data-mode="local">Team on this screen</button>
      ${online ? `<button type="button" class="ghost${session.mode === 'online' ? ' on' : ''}" data-mode="online">Team online</button>` : ''}
    </div>
    ${session.mode === 'local' ? `<div class="names">${[0, 1, 2, 3].map((i) => `<input data-name="${i}" maxlength="16" placeholder="Player ${i + 1}${i > 1 ? ' (optional)' : ''}" value="${esc(session.players[i]?.name ?? '')}">`).join('')}</div>
      <p class="note">Two to four players share this screen. Each role only lets its owner change its parts, so pass the device and talk it over.</p>` : ''}
    ${session.mode === 'online' ? `<div class="names"><input id="my-name" maxlength="16" placeholder="Your name" value="${esc(myName)}"></div>
      ${session.room ? `<p class="room">Room code <b>${esc(session.room.code)}</b><button type="button" class="ghost" id="copy-room">Copy invite link</button></p>
      <p class="note">${session.players.length} of 4 players here: ${session.players.map((p) => esc(p.name)).join(', ')}. Others join with the code on the first screen, or with the link.</p>` : '<p class="note">Creates a room that up to four players can join from their own devices.</p>'}` : ''}
    <ul class="roles">${ROLE_IDS.map(roleLine).join('')}</ul>
    <p class="note">${isTeam() ? 'Every role must say GO before launch, and each protected margin adds 25 points.' : 'Playing solo, you do all four jobs. Each margin you protect adds 25 points.'}</p>
    <div class="actions">
      <button class="launch" id="start" type="button">${session.mode === 'online' && !session.room ? 'Create room' : 'Start designing'}</button>
      <button class="ghost" id="brief-back" type="button">Missions</button>
    </div>`;
}

$('brief-body').onclick = async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.goal) {
    const max = LEVELS[config.level].goals, id = b.dataset.goal;
    const goals = max === 1 ? [id] : config.goals.includes(id) ? config.goals.filter((g) => g !== id) : [...config.goals, id].slice(-max);
    commit({ config: { ...config, goals: goals.length ? goals : [id] } });
  } else if (b.dataset.level) {
    const max = LEVELS[b.dataset.level].goals;
    let goals = config.goals.slice(0, max);
    if (goals.length < max) goals = [...goals, ...mission.goals.map((g) => g.id).filter((g) => !goals.includes(g))].slice(0, max);
    commit({ config: { level: b.dataset.level, goals } });
  } else if (b.dataset.mode) {
    setMode(b.dataset.mode);
  } else if (b.id === 'copy-room') {
    copy(`${location.origin}${location.pathname}#room=${session.room.code}`, b);
    return;
  } else if (b.id === 'brief-back') {
    return toMenu();
  } else if (b.id === 'start') {
    if (session.mode === 'online' && !session.room) return createOnline();
    if (session.mode === 'local' && session.players.length < 2) return void (b.textContent = 'Enter at least two names');
    return startBuild();
  }
  renderBrief();
};
$('brief-body').onchange = (e) => {
  if (e.target.dataset.name !== undefined) {
    const names = [...$('brief-body').querySelectorAll('[data-name]')].map((i) => i.value.trim()).filter(Boolean).slice(0, 4);
    session.players = names.map((name, i) => ({ id: `p${i}`, name }));
    if (session.players.length) { session.owners = dealRoles(session.players); session.me = session.players[0].id; }
    renderBrief();
  } else if (e.target.id === 'my-name') {
    pilot.name = e.target.value.trim().slice(0, 16) || 'Player'; savePilot();
  }
};

function setMode(mode) {
  if (mode === session.mode) return;
  session.room?.close();
  Object.assign(session, { mode, room: null, go: {}, me: myId, players: [{ id: myId, name: myName }] });
  if (mode === 'local') { session.players = [{ id: 'p0', name: 'Player 1' }, { id: 'p1', name: 'Player 2' }]; session.me = 'p0'; }
  session.owners = dealRoles(session.players);
  if (location.hash) history.replaceState(null, '', location.pathname);
}

// ---------- online rooms ----------
async function createOnline() {
  try { enterRoom(await net.createRoom({ mission: mission.id, config, design, phase: 'brief' })); } catch (err) { $('start').textContent = err.message || 'Could not create a room'; }
}
function enterRoom(code) {
  session.mode = 'online'; session.me = myId;
  session.room = net.joinRoom(code, { id: myId, name: myName }, onRoomState, () => { if (session.room) toMenu(); });
  history.replaceState(null, '', `#room=${code}`);
}
// Called every time anyone in the room changes anything.
function onRoomState(s) {
  if (session.mode !== 'online') return; // a late message from a room we already left
  session.players = s.players.length ? s.players : [{ id: myId, name: myName }];
  session.owners = s.owners; session.go = s.go ?? {};
  mission = MISSIONS.find((x) => x.id === s.mission) ?? MISSIONS[0];
  ({ config, design } = sane(mission, s.config, s.design));
  m = resolve(mission, config);
  if (s.choice && s.choice.n === flightN && answer) answer(s.choice.id);
  if (s.flight && s.flight.n > flightN) { flightN = s.flight.n; return void fly(s.flight.eventId); }
  if (flying) return;
  if (s.phase === 'brief') { renderBrief(); show('brief', 0); } else if (s.phase === 'build') { if (screen() === 'build') renderBuild(); else enterBuild(); }
  else if (s.phase === 'ready') { if (screen() === 'ready') renderReady(); else enterReady(); }
}

// ---------- build: space, ground and launch segments ----------
const TABS = [
  { id: 'instruments', label: 'Instruments', seg: 'Space', table: INSTRUMENTS, help: 'The reason the mission exists. Pick one or more. Each one adds cost, mass, power use, data and build time.' },
  { id: 'solar', label: 'Power', seg: 'Space', table: SOLAR, help: 'Makes electricity. Pick one.' },
  { id: 'battery', label: 'Battery', seg: 'Space', table: BATTERIES, help: 'Stores energy for when the planet blocks the Sun. Pick one.' },
  { id: 'pointing', label: 'Pointing', seg: 'Space', table: POINTING, help: 'Attitude control: how the craft turns and holds still. Cameras and narrow radio beams need it steady.' },
  { id: 'computer', label: 'Computer', seg: 'Space', table: COMPUTERS, help: 'The onboard computer runs everything and stores data until the next radio contact.' },
  { id: 'antenna', label: 'Antenna', seg: 'Space', table: ANTENNAS, help: 'Sends your data home. Pick one.' },
  { id: 'ground', label: 'Ground stations', seg: 'Ground', table: GROUND, help: 'The dishes and people on Earth who receive the data and run the mission. More stations mean more contact time, and cost more every year.' },
  { id: 'orbit', label: 'Orbit', seg: 'Launch', table: ORBITS, help: 'Where the spacecraft will fly. It changes sunlight, radio contact, lifetime and what the rocket must do.' },
  { id: 'rocket', label: 'Rocket', seg: 'Launch', table: ROCKETS, help: 'Gets you there. The farther the orbit, the less it can carry.' },
];
const roleOf = (tabId) => ROLE_IDS.find((r) => ROLES[r].owns.includes(tabId));
const canEdit = (tabId) => !isTeam() || session.owners[roleOf(tabId)] === session.me;
const BARS = [
  { id: 'budget', label: 'Budget', learn: 'Money to build the spacecraft, buy the rocket and run the ground stations. Go over and the mission is cancelled.' },
  { id: 'time', label: 'Schedule', learn: 'Months to build and test everything, against the months until the launch window. Advanced parts take longer.' },
  { id: 'mass', label: 'Mass', learn: 'Everything you add makes the spacecraft heavier. A rocket can only lift so much, and less to faraway orbits.' },
  { id: 'power', label: 'Power', learn: 'Watts your equipment uses, against watts your power source makes on average (panels make nothing in shadow).' },
  { id: 'battery', label: 'Battery', learn: 'Energy needed to get through the longest shadow, against what the battery holds. Using less than 70% keeps it healthy.' },
  { id: 'data', label: 'Data link', learn: 'Gigabytes your instruments record each day, against what the antenna and ground stations can bring home each day.' },
  { id: 'life', label: 'Lifetime', learn: 'How long the spacecraft should survive, against how long the mission needs.' },
];
const fitWord = (v) => (v >= 1.2 ? 'Perfect fit' : v >= 0.9 ? 'Good fit' : v >= 0.6 ? 'Some use' : 'Poor fit');
const bodyNow = () => (mission.sandbox ? ORBITS[design.orbit]?.body ?? 'earth' : mission.body);

function startBuild() {
  if (session.mode === 'online') return commit({ phase: 'build' });
  return enterBuild();
}
function enterBuild() {
  m = resolve(mission, config);
  kept[mission.id] = { config, design };
  tab = 'instruments'; openBar = null; flying = false;
  $('m-level').textContent = `${mission.level} · ${mission.sandbox ? 'no limits' : LEVELS[m.levelId].name}`;
  $('m-name').textContent = mission.name;
  $('m-goals').textContent = mission.sandbox ? mission.brief : `Goal: ${m.chosen.map((g) => g.name).join(' and ')}.`;
  orbi(mission.hint);
  shownBody = bodyNow();
  view.setBody(shownBody); view.setMode('build');
  renderBuild();
}
const orbi = (text) => { $('orbi-text').textContent = `${text} ${nextStep()}`; };

// What ORBI suggests doing next: the first thing still missing.
function nextStep() {
  const need = [['instruments', 'an instrument'], ['solar', 'a power source'], ['computer', 'a flight computer'], ['battery', 'a battery'], ['pointing', 'pointing control'], ['antenna', 'an antenna'], ['ground', 'a ground station'], ['orbit', 'an orbit'], ['rocket', 'a rocket']];
  const gap = need.find(([id]) => (id === 'instruments' ? !design.instruments.length : !design[id]));
  return gap ? `Next: choose ${gap[1]}.` : '';
}

function chips(t, p) {
  const orbit = ORBITS[design.orbit], c = [];
  if (p.cost !== undefined) c.push(['Cost', `$${p.cost}M`]);
  if (p.mass !== undefined) c.push(['Mass', `${p.mass} kg`]);
  if (t.id === 'instruments') c.push(['Uses', `${p.power} W`], ['Makes', `${p.data} GB/day`], ['Science', `${p.science}`]);
  else if (t.id === 'solar') {
    const share = p.nuclear ? 1 : orbit ? orbit.sun * (orbit.solar ?? 1) : null;
    c.push(['Makes', share === null ? `${p.watts} W in full sun` : `${num(p.watts * share)} W average here`]);
  } else if (t.id === 'battery') c.push(['Holds', `${p.wh} Wh`]);
  else if (t.id === 'pointing') c.push(['Uses', `${p.power} W`], ['Sharpness', `${Math.round(p.sharp * 100)}%`]);
  else if (t.id === 'computer') c.push(['Uses', `${p.power} W`], ['Memory', `${p.storage} GB`], ...(p.compress ? [['Shrinks data', `${Math.round((1 - p.compress) * 100)}%`]] : []));
  else if (t.id === 'antenna') c.push(['Uses', `${p.power} W`], ['Speed', `${p.mbps} Mbit/s`]);
  else if (t.id === 'ground') c.push(['Running', `$${p.ops}M a year`], ['Contact', orbit ? `${num(Math.min(24, orbit.contactH * p.contact))} h/day here` : `x${p.contact}`]);
  else if (t.id === 'orbit') c.push(['Sunlight', `${Math.round(p.sun * (p.solar ?? 1) * 100)}%`], ['Radio contact', `${p.contactH} h/day per station`], ['Signal', p.range === 1 ? 'Strong' : `${p.range * 100}% strength`], ['Lasts', `${p.life} years`]);
  else if (t.id === 'rocket') c.push(orbit ? ['Lifts here', p.cap[orbit.cls] ? `${num(p.cap[orbit.cls])} kg` : 'Cannot reach'] : ['Lifts', `${num(p.cap.leo)} kg to low orbit`]);
  if (p.months) c.push(['Build', `${p.months} months`]);
  return c.map(([k, v]) => chip(k, v)).join('');
}

function renderBuild() {
  const b = computeBudgets(design, m), orbit = ORBITS[design.orbit], free = mission.sandbox;
  if (bodyNow() !== shownBody) { shownBody = bodyNow(); view.setBody(shownBody); }
  view.setDesign(design, orbit ?? null);

  // Tabs, grouped by mission segment
  $('tabs').innerHTML = ['Space', 'Ground', 'Launch'].map((seg) => `<div class="seg"><span>${seg} segment</span><div class="tabs">${TABS.filter((t) => t.seg === seg).map((t) => {
    const done = t.id === 'instruments' ? design.instruments.length : design[t.id];
    return `<button type="button" role="tab" aria-selected="${t.id === tab}" data-tab="${t.id}" class="${done ? 'done' : ''}${canEdit(t.id) ? '' : ' locked'}">${t.label}</button>`;
  }).join('')}</div></div>`).join('');

  // Cards
  const t = TABS.find((x) => x.id === tab), mine = canEdit(t.id), role = roleOf(t.id);
  const options = t.id === 'orbit' ? Object.keys(m.orbits) : m.parts[t.id];
  $('tab-help').innerHTML = `${esc(t.help)}${isTeam() ? ` <b class="${mine ? 'mine' : 'theirs'}">${mine ? `Yours to decide (${esc(ROLES[role].name)}).` : `Decided by ${esc(playerName(session.owners[role]))}, ${esc(ROLES[role].name)}. Talk to them.`}</b>` : ''}`;
  $('cards').innerHTML = options.map((id) => {
    const p = t.table[id], on = t.id === 'instruments' ? design.instruments.includes(id) : design[t.id] === id;
    const fit = free ? null : t.id === 'instruments' ? m.value[id] ?? 0.3 : t.id === 'orbit' ? m.orbits[id] : null;
    return `<button type="button" class="card${on ? ' on' : ''}" aria-pressed="${on}" data-id="${id}"${mine ? '' : ' disabled'}>
      <span class="card-head"><strong>${esc(p.name)}</strong><span class="kind">${esc(p.kind ?? p.alt ?? '')}</span></span>
      ${fit === null ? '' : `<span class="fit f${fit >= 0.9 ? 2 : fit >= 0.6 ? 1 : 0}">${fitWord(fit)} for this mission</span>`}
      <span class="chips">${chips(t, p)}</span>
      <span class="learn">${esc(p.learn)}</span>
      ${p.real ? `<span class="learn real">${esc(p.real)}</span>` : ''}
    </button>`;
  }).join('');

  // Expected science and the requirements checklist
  $('science').innerHTML = `<div class="sci-head"><span>Expected science</span><b>${num(b.science)}${free ? '' : ` / ${b.goal}`} a day</b></div>
    <div class="track goal"><span style="width:${Math.round(Math.min(1, b.science / b.goal) * 100)}%"></span></div>`;
  const verified = b.requirements.filter((q) => q.ok).length;
  $('reqs').innerHTML = free ? '' : `<h3>Requirements <span>${verified} of ${b.requirements.length} verified</span></h3>
    <ul class="reqs">${b.requirements.map((q) => `<li class="${q.ok ? 'ok' : 'no'}" title="${esc(q.how)}">${esc(q.text)}</li>`).join('')}</ul>`;

  // Resource bars
  const rows = {
    budget: [b.cost, b.budget, free ? `$${num(b.cost)}M · no limit` : `$${num(b.cost)}M of $${b.budget}M`],
    time: [b.months, b.deadline, free ? `${b.months} months` : `${b.months} of ${b.deadline} months`],
    mass: [b.mass, b.capacity, b.capacity === null ? `${num(b.mass)} kg · choose orbit and rocket` : `${num(b.mass)} of ${num(b.capacity)} kg`],
    power: [b.load, b.gen, `uses ${num(b.load)} W · makes ${num(b.gen)} W`],
    battery: [b.battNeed, b.battCap, orbit ? `needs ${num(b.battNeed)} Wh · holds ${num(b.battCap)} Wh` : 'choose an orbit'],
    data: [b.dataGen, b.downlink, `makes ${num(b.dataGen)} · sends ${num(b.downlink)} GB/day`],
    life: [b.years, b.life, orbit ? `${num(b.life)} of ${b.years} years needed` : 'choose an orbit'],
  };
  $('bars').innerHTML = BARS.map((bar) => {
    const [used, limit, text] = rows[bar.id], warn = b.warn[bar.id];
    const ratio = limit ? used / limit : used ? 1.2 : 0;
    const state = warn ? ((bar.id === 'battery' && !b.blackout) || bar.id === 'time' ? 'warn' : 'bad') : ratio > 0.85 && bar.id !== 'life' ? 'warn' : 'ok';
    const fill = bar.id === 'life' ? (b.years ? Math.min(1, b.life / b.years) : 0) : Math.min(1, ratio);
    return `<div class="bar ${state}">
      <button type="button" class="bar-head" aria-expanded="${openBar === bar.id}" data-bar="${bar.id}"><span>${bar.label}</span><span class="bar-val">${esc(text)}</span></button>
      <div class="track"><span style="width:${Math.round(fill * 100)}%"></span></div>
      ${warn ? `<p class="bar-warn">${esc(warn)}</p>` : ''}
      ${openBar === bar.id ? `<p class="bar-learn">${esc(bar.learn)}</p>` : ''}
    </div>`;
  }).join('');

  // The team: who owns what, whose margin is safe, who has said GO
  $('team').innerHTML = `<h3>${isTeam() ? 'Team margins' : 'Review board'} <span>+25 points each</span></h3>
    ${session.mode === 'local' ? `<div class="seats">${session.players.map((p) => `<button type="button" class="ghost${p.id === session.me ? ' on' : ''}" data-seat="${p.id}">${esc(p.name)}</button>`).join('')}</div>` : ''}
    <ul class="roles">${ROLE_IDS.map((r) => `<li class="${b.roles[r].ok ? 'ok' : 'no'}${isTeam() && session.go[r] ? ' go' : ''}">
      <b>${esc(ROLES[r].name)}</b>${isTeam() ? ` <span class="who">${esc(playerName(session.owners[r]))}${session.go[r] ? ' · GO' : ''}</span>` : ''}
      <span>${esc(ROLES[r].aim)}</span><span class="now">${esc(b.roles[r].now)}</span></li>`).join('')}</ul>`;

  // The readiness review and the launch poll happen on the launch pad.
  const missing = !design.orbit ? 'Choose an orbit' : !design.rocket ? 'Choose a rocket' : null;
  $('launch').disabled = !!missing;
  $('launch').textContent = missing ?? 'To the launch pad';
  show('build', 3);
}

$('tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; renderBuild(); } };
$('bars').onclick = (e) => { const b = e.target.closest('[data-bar]'); if (b) { openBar = openBar === b.dataset.bar ? null : b.dataset.bar; renderBuild(); } };
$('team').onclick = (e) => { const b = e.target.closest('[data-seat]'); if (b) { session.me = b.dataset.seat; renderBuild(); } };
$('cards').onclick = (e) => {
  const c = e.target.closest('.card');
  if (!c || c.disabled) return;
  const t = TABS.find((x) => x.id === tab), id = c.dataset.id, p = t.table[id];
  let added, next;
  if (t.id === 'instruments') {
    added = !design.instruments.includes(id);
    next = { ...design, instruments: added ? [...design.instruments, id] : design.instruments.filter((x) => x !== id) };
  } else {
    added = design[t.id] !== id;
    next = { ...design, [t.id]: added ? id : null };
  }
  commit({ design: next, go: {} }); // any change to the design reopens the launch poll
  (added ? SFX.pick : SFX.drop)();
  orbi(added ? p.quip : `${p.name} removed.`);
  renderBuild();
};

// ---------- launch pad: readiness review, launch poll, hold to launch ----------
const WEATHER = [
  'Weather at the Cape: clear, light wind. The birds have been asked to move.',
  'Weather at the Cape: 24 degrees and a few clouds. A good day to leave the planet.',
  'Weather at the Cape: calm. The only storm is in the budget meeting.',
];
let weather = WEATHER[0], reviewTimers = [];
function toPad() { cutTo(() => (session.mode === 'online' ? commit({ phase: 'ready' }) : enterReady())); }
function enterReady() {
  m = resolve(mission, config);
  flying = false;
  weather = WEATHER[Math.floor(Math.random() * WEATHER.length)];
  $('craft-name').value = design.name ?? '';
  view.showPad(design.rocket);
  renderReady(true); show('ready', 4);
}
// reveal = true reads the checks out one by one, the first time the review opens.
function renderReady(reveal = false) {
  const b = computeBudgets(design, m), free = mission.sandbox, team = isTeam();
  const failed = free ? 0 : b.requirements.filter((q) => !q.ok).length, gone = ROLE_IDS.filter((r) => session.go[r]).length;
  if (document.activeElement !== $('craft-name')) $('craft-name').value = design.name ?? '';
  let i = 0;
  const row = (state, title, verdict, text, extra = '') => `<li class="${state}" style="--i:${i++}"><b>${esc(title)}</b><em>${verdict}</em><span>${esc(text)}</span>${extra}</li>`;
  $('review').innerHTML = `
    <p class="manifest">${esc(ROCKETS[design.rocket].name)} to ${esc(ORBITS[design.orbit].name)} · ${num(b.mass)} kg · $${num(b.cost)}M · ${b.months} months to build</p>
    ${free ? '' : `<h3>Systems check <span>${b.requirements.length - failed} of ${b.requirements.length} verified</span></h3>
    <ul class="checks${reveal ? ' reveal' : ''}">${b.requirements.map((q) => row(q.ok ? 'ok' : 'no', q.text, q.ok ? 'GO' : 'NO-GO', q.how)).join('')}</ul>`}
    <h3>${team ? `Launch poll <span>${gone} of 4 GO</span>` : 'Review board <span>+25 points each</span>'}</h3>
    <ul class="checks${reveal ? ' reveal' : ''}">${ROLE_IDS.map((r) => {
      const ok = b.roles[r].ok, mine = session.mode === 'local' || session.owners[r] === session.me;
      if (!team) return row(ok ? 'ok' : 'thin', ROLES[r].name, ok ? 'MARGIN OK' : 'THIN', b.roles[r].now);
      return row(session.go[r] ? 'ok' : 'wait', `${ROLES[r].name} · ${playerName(session.owners[r])}`, session.go[r] ? 'GO' : 'WAITING', `${ok ? 'Margin protected.' : 'Margin thin.'} ${b.roles[r].now}`,
        `<button type="button" class="ghost${session.go[r] ? ' on' : ''}" data-go="${r}"${mine ? '' : ' disabled'}>${session.go[r] ? 'GO given' : 'Say GO'}</button>`);
    }).join('')}</ul>
    <p class="note">${esc(weather)}</p>`;
  const waiting = team && !allGo();
  $('ready-text').textContent = failed ? `${failed} ${failed > 1 ? 'requirements are' : 'requirement is'} not verified. Go back and fix the design, or launch anyway and find out why it matters.`
    : waiting ? 'Every role must say GO. Talk it over: is everyone happy with their margin?'
    : 'All systems are go. Hold the button to light the engines.';
  $('ignite').disabled = waiting;
  $('ignite').querySelector('.label').textContent = waiting ? `Launch poll ${gone} of 4` : 'Hold to launch';
  reviewTimers.forEach(clearTimeout); reviewTimers = [];
  if (reveal && !calm) {
    $('review').querySelectorAll('.checks li').forEach((li, n) => reviewTimers.push(setTimeout(() => {
      if (li.matches('.ok')) beep(880, 0.05, 'sine', 0.035); else beep(220, 0.12, 'square', 0.03);
    }, 350 + n * 240)));
  }
}
$('review').onclick = (e) => {
  const b = e.target.closest('[data-go]');
  if (!b || b.disabled) return;
  commit({ go: { ...session.go, [b.dataset.go]: !session.go[b.dataset.go] } });
  if (session.go[b.dataset.go]) SFX.go();
  renderReady();
};
$('craft-name').onchange = (e) => { commit({ design: { ...design, name: e.target.value.trim().slice(0, 20) } }); renderReady(); };
$('ready-back').onclick = () => { if (session.mode === 'online') commit({ phase: 'build' }); else enterBuild(); };

// The launch button must be held down, so nobody launches by accident. With the keyboard, Enter launches at once.
let holdTimer = null, holdTicks = null;
function holdEnd() { clearTimeout(holdTimer); clearInterval(holdTicks); holdTimer = null; $('ignite').classList.remove('holding'); }
function holdStart() {
  if ($('ignite').disabled || holdTimer) return;
  let n = 0;
  $('ignite').classList.add('holding');
  holdTicks = setInterval(() => beep(300 + n++ * 90, 0.07, 'square', 0.035), 160);
  holdTimer = setTimeout(() => { holdEnd(); launch(); }, 1100);
}
$('ignite').onpointerdown = holdStart;
$('ignite').onpointerup = $('ignite').onpointerleave = $('ignite').onpointercancel = holdEnd;
$('ignite').onclick = (e) => { if (e.detail === 0 && !$('ignite').disabled) launch(); };

// ---------- flight ----------
const PHASES = ['Countdown', 'Lift-off', 'Staging', 'Orbit', 'Unfold', 'Operations'];
const PHASE_OF = { c3: 0, c2: 0, c1: 0, ignition: 0, liftoff: 1, climb: 1, space: 1, boosters: 2, staging: 2, fairing: 2, coast: 3, release: 3, deploy: 4, cruise: 4, orbit: 5 };
function setPhase(now, failed) {
  $('phases').innerHTML = PHASES.map((name, i) => `<li class="${i < now ? 'done' : i === now ? (failed ? 'fail' : 'now') : ''}">${name}</li>`).join('');
}
function captions(r, eventId) {
  const rocket = ROCKETS[design.rocket], orbit = ORBITS[design.orbit], where = BODY[orbit.body];
  return {
    c3: '3', c2: '2', c1: '1',
    ignition: 'Ignition.',
    liftoff: `Lift-off from Florida. ${rocket.name} is carrying ${design.name ? `${design.name} (${num(r.mass)} kg)` : `${num(r.mass)} kg`} towards ${orbit.name}.`,
    climb: 'Through the clouds. The sky turns black about 100 km up.',
    space: 'Now it leans east and speeds up. Reaching orbit is about going sideways very fast.',
    boosters: 'Boosters empty. Dropping them makes the rocket lighter.',
    staging: 'Stage one is out of fuel and falls away. Stage two lights its engine.',
    fairing: 'Above the air, the nose cover is dead weight. It splits open and falls away.',
    coast: 'Engine off. We are in orbit: falling around Earth, and always missing it.',
    release: `${design.name ? `${design.name} is free: ` : ''}${num(r.mass)} kg of spacecraft pushed clear. The rocket's job is done.`,
    falling: 'The engine has run dry, and we are not in orbit yet.',
    crash: 'Engineers call that a rapid unscheduled disassembly.',
    cancelled: 'The accountants reached the launch pad first. Launch cancelled.',
    deploy: 'Unfolding: solar wings first, then the antenna and instruments.',
    cruise: orbit.body === 'moon' ? 'Three days of coasting to the Moon.' : 'Seven months of coasting to Mars. Bring a book.',
    orbit: `${design.name || 'The spacecraft'} is in orbit around ${where}. Collecting ${num(r.dataGen)} GB a day, sending ${num(Math.min(r.dataGen, r.downlink) * r.kept)} home.`,
    shadow: `Into the shadow of ${where}. Running on battery.`,
    blackout: 'Battery empty. Everything is off until sunrise.',
    dead: 'No power, or no brain. It is very quiet up here.',
    event: eventId !== 'quiet' ? `${EVENTS[eventId].name}!` : '',
  };
}

function launch() {
  reviewTimers.forEach(clearTimeout);
  const eventId = mission.id === 'earth' && !isTeam() ? 'quiet' : ['quiet', 'meteor', 'station', 'flare'][Math.floor(Math.random() * 4)];
  if (session.mode === 'online') return commit({ phase: 'flight', flight: { n: flightN + 1, eventId }, choice: null });
  flightN++;
  return fly(eventId);
}

// Ask the team what to do about a surprise. The role it concerns decides.
function askDecision(ev) {
  return new Promise((done) => {
    const owner = session.owners[ev.role], mine = !isTeam() || session.mode === 'local' || owner === session.me;
    view.setPaused(true); SFX.alarm();
    $('decision').hidden = false;
    $('decision').innerHTML = `<p class="eyebrow">Decision${isTeam() ? ` for ${esc(playerName(owner))}, ${esc(ROLES[ev.role].name)}` : ''}</p>
      <h3>${esc(ev.name)}</h3><p>${esc(ev.text)}</p>
      <div class="picks">${ev.choices.map((c) => `<button type="button" class="card" data-choice="${c.id}"${mine ? '' : ' disabled'}><strong>${esc(c.label)}</strong><span class="learn">${esc(c.text)}</span></button>`).join('')}</div>
      ${mine ? '' : '<p class="note">Waiting for their decision. Tell them what you think.</p>'}`;
    answer = (id) => { answer = null; $('decision').hidden = true; view.setPaused(false); done(id); };
    $('decision').onclick = (e) => {
      const b = e.target.closest('[data-choice]');
      if (!b || b.disabled) return;
      if (session.mode === 'online') session.room.send({ choice: { n: flightN, id: b.dataset.choice } }); else answer(b.dataset.choice);
    };
  });
}

async function fly(eventId) {
  flying = true;
  m = resolve(mission, config);
  const ev = EVENTS[eventId];
  let r = simulate(design, m, eventId), choice;
  const text = captions(r, eventId), flies = r.stage === 'orbit';
  $('caption').textContent = ''; $('decision').hidden = true;
  // Mission clock and progress strip. The clock stops while the team is deciding.
  let phaseNow = 0, clock = 0, last = performance.now(), clockText = null, orbitAt = null;
  setPhase(0);
  const two = (x) => String(x).padStart(2, '0');
  const tick = setInterval(() => {
    const now = performance.now();
    if (!answer) clock += (now - last) / 1000;
    last = now;
    const t = clock < 3.6 ? 3 - Math.floor(clock / 1.2) : Math.floor(clock - 3.6); // the countdown beats are a little longer than a second
    $('clock').textContent = clockText ?? (orbitAt !== null ? `Mission day ${1 + Math.floor((clock - orbitAt) * 24)}` : `T${clock < 3.6 ? '-' : '+'} ${two(Math.floor(t / 60))}:${two(t % 60)}`);
  }, 100);
  $('hud').innerHTML = flies ? chip('Power', `${Math.round(r.duty * 100)}%`) + chip('Data sent home', `${Math.round(r.sent * r.kept * 100)}%`) + chip('Lifetime', `${num(r.life)} yr`) : '';
  show('flight', 5);
  await view.playFlight({
    rocket: design.rocket, orbit: ORBITS[design.orbit], body: ORBITS[design.orbit].body,
    fail: flies ? null : r.stage, blackout: r.blackout, sent: r.sent * r.kept,
    hasData: design.instruments.length > 0 && !!design.antenna && !!design.ground, event: flies && eventId !== 'quiet' ? eventId : null,
  }, (phase) => {
    if (text[phase]) $('caption').textContent = text[phase];
    if (phase in PHASE_OF) { phaseNow = Math.max(phaseNow, PHASE_OF[phase]); setPhase(phaseNow); }
    if (['falling', 'crash', 'cancelled', 'dead'].includes(phase)) setPhase(phaseNow, true);
    if (phase === 'cancelled') clockText = 'Launch scrubbed';
    if (phase === 'cruise') clockText = `Cruise to ${BODY[ORBITS[design.orbit].body]}`;
    if (phase === 'orbit') { clockText = null; orbitAt = clock; }
    $('caption').classList.toggle('count', /^c\d$/.test(phase));
    if (/^c\d$/.test(phase)) beep(440, 0.12, 'square', 0.04);
    if (phase === 'ignition') SFX.launch();
    if (phase === 'fade' || phase === 'fade2') flash('cut');
    if (phase === 'crash') SFX.crash();
    if (['boosters', 'staging', 'fairing', 'release'].includes(phase)) SFX.part();
    if (phase === 'deploy') SFX.unfold();
    if (phase === 'cruise') flash('go');
    if (phase === 'event' && ev.choices.length > 1) {
      askDecision(ev).then((id) => {
        choice = id;
        r = simulate(design, m, eventId, id);
        view.patchPlan({ blackout: r.blackout, sent: r.sent * r.kept });
        $('caption').textContent = `You chose: ${ev.choices.find((c) => c.id === id).label.toLowerCase()}.`;
      });
    }
  });
  if (answer) answer(ev.choices[0].id); // skipped past the decision: carry on as designed
  r = simulate(design, m, eventId, choice);
  clearInterval(tick);
  flying = false;
  renderReport(r);
}

// ---------- report ----------
function renderReport(r) {
  const free = mission.sandbox, best = load('orbit-forge-best', {}), prev = lastRun[mission.id];
  if (!free && (!best[mission.id] || r.score > best[mission.id].score)) { best[mission.id] = { score: r.score, stars: r.stars }; save('orbit-forge-best', best); }
  (r.stars >= 2 ? SFX.win : SFX.lose)();
  const gained = free ? null : career(r);
  const tag = { bad: 'Problem', warn: 'Watch out', event: 'Surprise', good: 'Well done' };
  const delta = (now, was, unit = '', lowerIsBetter) => {
    const d = now - was;
    return Math.abs(d) < 0.05 ? '<td>same</td>' : `<td class="${(d > 0) !== !!lowerIsBetter ? 'up' : 'down'}">${d > 0 ? '+' : ''}${num(d)}${unit}</td>`;
  };
  $('report-body').innerHTML = `
    <p class="eyebrow centre">${esc(design.name || mission.name)}${free ? ' · sandbox flight' : ` · flight ${pilot.flights}`}</p>
    ${free ? '' : `<div class="stars">${starRow(r.stars)}</div>`}
    <h2>${free ? (r.stage === 'orbit' ? 'It flew' : 'It did not fly') : esc(r.label)}</h2>
    ${free ? '' : `<p class="big-score"><b id="score-n">0</b><span>of 1000</span></p>
    <p class="score">${r.teamwork ?? 0} from margins · ${r.points} ranking points on ${esc(LEVELS[m.levelId].name)} · best ${best[mission.id]?.score ?? r.score}</p>
    ${gained.promoted ? `<p class="promo">Promoted to ${esc(gained.promoted.name)}</p>` : ''}
    <div class="career">
      <p class="gain">+${gained.gain} XP</p>
      ${careerHTML(gained.fromXp)}
      ${gained.fresh.length ? `<h3>New badge${gained.fresh.length > 1 ? 's' : ''}</h3>${badgeList(gained.fresh, ' new')}` : ''}
    </div>`}
    <div class="numbers">
      <div><i>Science</i><b>${num(r.science)}${free ? '' : ` / ${r.goal}`} a day</b></div><div><i>Lifetime</i><b>${num(r.life)} / ${r.years} years</b></div>
      <div><i>Cost</i><b>$${num(r.cost)}M${free ? '' : ` / $${r.budget}M`}</b></div><div><i>Mass</i><b>${num(r.mass)} kg</b></div><div><i>Build time</i><b>${r.months} months</b></div>
    </div>
    ${free ? '' : `<h3>Requirements</h3><ul class="reqs">${r.requirements.map((q) => `<li class="${q.ok ? 'ok' : 'no'}">${esc(q.text)} <i>${esc(q.how)}</i></li>`).join('')}</ul>`}
    <h3>What happened, and why</h3>
    <ul class="findings">${r.findings.map((f) => `<li class="${f.kind}"><span class="tag">${tag[f.kind]}</span><strong>${esc(f.title)}</strong>
      <p>${esc(f.text)}</p>${f.tip ? `<p class="tip"><b>${f.kind === 'good' ? 'Note:' : 'Try:'}</b> ${esc(f.tip)}</p>` : ''}</li>`).join('')}</ul>
    <h3>${isTeam() ? 'Team margins' : 'Review board'}</h3>
    <ul class="roles">${ROLE_IDS.map((id) => `<li class="${r.roles[id].ok ? 'ok' : 'no'}"><b>${esc(ROLES[id].name)}</b>${isTeam() ? ` <span class="who">${esc(playerName(session.owners[id]))}</span>` : ''}
      <span>${esc(ROLES[id].aim)}</span><span class="now">${r.roles[id].ok ? 'Protected: +25 points.' : esc(r.roles[id].now)}</span></li>`).join('')}</ul>
    ${r.real ? `<h3>The real mission most like yours</h3><div class="real-card"><strong>${esc(r.real.name)}</strong><p>${esc(r.real.fact)}</p></div>` : ''}
    ${prev ? `<h3>Compared with your last try</h3><table class="compare"><tr><th></th><th>Last</th><th>Now</th><th>Change</th></tr>
      <tr><th>Score</th><td>${prev.score}</td><td>${r.score}</td>${delta(r.score, prev.score)}</tr>
      <tr><th>Science a day</th><td>${num(prev.science)}</td><td>${num(r.science)}</td>${delta(r.science, prev.science)}</tr>
      <tr><th>Cost</th><td>$${num(prev.cost)}M</td><td>$${num(r.cost)}M</td>${delta(r.cost, prev.cost, 'M', true)}</tr>
      <tr><th>Mass</th><td>${num(prev.mass)} kg</td><td>${num(r.mass)} kg</td>${delta(r.mass, prev.mass, ' kg', true)}</tr>
      <tr><th>Build time</th><td>${prev.months} mo</td><td>${r.months} mo</td>${delta(r.months, prev.months, ' mo', true)}</tr></table>` : ''}
    <div class="actions">
      <button class="launch" id="retry" type="button">Change design and try again</button>
      <button class="ghost" id="to-menu" type="button">Missions</button>
      <button class="ghost" id="share" type="button">Copy link to this design</button>
    </div>
    ${free ? '' : `<form class="rank-form" id="rank-form"><label for="rank-name">Add this flight to the rankings</label>
      <input id="rank-name" maxlength="24" value="${esc(isTeam() ? session.players.map((p) => p.name).join(' + ') : myName)}"><button class="ghost" type="submit">Add</button>
      <button class="ghost" type="button" id="see-ranks">See rankings</button></form>`}`;
  $('report-body').dataset.points = r.points; $('report-body').dataset.stars = r.stars;
  lastRun[mission.id] = { score: r.score, science: r.science, cost: r.cost, mass: r.mass, months: r.months };
  show('report', 5);
  $('retry').focus({ preventScroll: true });
  if (!free) {
    countUp($('score-n'), r.score);
    requestAnimationFrame(() => requestAnimationFrame(() => { const bar = $('report-body').querySelector('.xp .track span'); if (bar) bar.style.width = `${bar.dataset.to}%`; }));
    if (gained.promoted) setTimeout(SFX.go, 900);
    if (r.stars >= 2 && !calm) confetti();
  }
}

function countUp(el, to, ms = 1100) {
  const t0 = performance.now();
  const step = (now) => { const k = Math.min(1, (now - t0) / ms); el.textContent = Math.round(to * (1 - (1 - k) ** 3)); if (k < 1 && el.isConnected) requestAnimationFrame(step); };
  if (calm) el.textContent = to; else requestAnimationFrame(step);
}
function confetti() {
  const rand = (a, b) => a + Math.random() * (b - a);
  $('confetti').innerHTML = Array.from({ length: 70 }, (_, i) => `<i style="left:${rand(0, 100)}%;background:${PATCH_COLOURS[i % 5]};animation-delay:${rand(0, 0.7)}s;animation-duration:${rand(2.2, 3.8)}s;--r:${rand(-540, 540)}deg;--x:${rand(-14, 14)}vw"></i>`).join('');
  setTimeout(() => { $('confetti').innerHTML = ''; }, 4800);
}

async function copy(text, button) {
  const label = button.textContent;
  try { await navigator.clipboard.writeText(text); button.textContent = 'Copied'; } catch { prompt('Copy this link:', text); }
  setTimeout(() => { button.textContent = label; }, 1600);
}
// A design travels in the link itself, so anyone can open it, fly it and try to beat it.
const designLink = () => `${location.origin}${location.pathname}#d=${btoa(JSON.stringify({ m: mission.id, c: config, d: design }))}`;

$('report-body').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'retry') { if (session.mode === 'online') commit({ phase: 'build', go: {} }); else { session.go = {}; enterBuild(); } }
  if (b.id === 'to-menu') toMenu();
  if (b.id === 'share') copy(designLink(), b);
  if (b.id === 'see-ranks') openRanks(mission.id);
};
$('report-body').onsubmit = async (e) => {
  e.preventDefault();
  const body = $('report-body'), entry = {
    name: $('rank-name').value.trim() || 'Anonymous', mission: mission.id, goals: m.chosen.map((g) => g.name).join(' + '), level: LEVELS[m.levelId].name,
    points: Number(body.dataset.points), stars: Number(body.dataset.stars), team: session.players.length,
  };
  save('orbit-forge-runs', [...load('orbit-forge-runs', []), entry].sort((a, b) => b.points - a.points).slice(0, 60));
  if (online) await net.saveScore(entry);
  $('rank-form').innerHTML = '<p class="note">Added. Share the design link to challenge another team on the same mission.</p><button class="ghost" type="button" id="see-ranks">See rankings</button>';
};

// ---------- rankings and "how it works" ----------
async function openRanks(missionId = 'earth') {
  const table = (rows) => (rows?.length ? `<table class="compare"><tr><th>#</th><th>Team</th><th>Goal</th><th>Level</th><th>Players</th><th>Points</th></tr>${rows.slice(0, 15).map((s, i) =>
    `<tr><td>${i + 1}</td><th>${esc(s.name)}</th><td>${esc(s.goals)}</td><td>${esc(s.level)}</td><td>${s.team}</td><td>${s.points}</td></tr>`).join('')}</table>` : '<p class="note">No flights saved yet.</p>');
  const everyone = online ? await net.loadScores(missionId) : null;
  $('overlay-body').innerHTML = `<h2>Rankings</h2>
    <div class="modes">${MISSIONS.filter((x) => !x.sandbox).map((x) => `<button type="button" class="ghost${x.id === missionId ? ' on' : ''}" data-ranks="${x.id}">${esc(x.name)}</button>`).join('')}</div>
    <p class="note">Ranking points are the score times the level: Pathfinder x0.8, Standard x1, Flagship x1.4. Teams on the same mission and goal are solving the same problem.</p>
    ${everyone ? `<h3>Everyone on this server</h3>${table(everyone)}` : ''}
    <h3>This device</h3>${table(load('orbit-forge-runs', []).filter((s) => s.mission === missionId))}`;
  $('overlay').hidden = false;
}
function openAbout() {
  $('overlay-body').innerHTML = `<h2>How it works</h2>
    <p class="lede2">This game follows the way NASA really designs a science mission.</p>
    <ol class="how">
      <li><b>Need and goals.</b> Start from the people who will use the data. Their need decides everything else.</li>
      <li><b>Concept.</b> Where must the spacecraft be to see what they need? That is the orbit.</li>
      <li><b>Requirements.</b> Turn the goal into numbers that can be checked: how much science, for how long, for how much money, by when.</li>
      <li><b>Design.</b> A mission has four segments. <b>Space</b>: the spacecraft and its instruments. <b>Ground</b>: the stations and people who talk to it. <b>Launch</b>: the rocket and the orbit. <b>Users</b>: the people waiting for the data.</li>
      <li><b>Build and verify.</b> Check every requirement, then hold the launch poll: every role must say GO.</li>
      <li><b>Fly.</b> Launch, deal with surprises, deliver the data, and learn why it worked or failed.</li>
    </ol>
    <h3>Playing as a team</h3>
    <p>Up to four players share one mission. Each has a role that owns some decisions and a margin to protect, but the budget, the mass and the schedule are shared, so you have to negotiate. Play on one screen, or start the game with <code>node server.mjs</code> to play from separate devices with a room code.</p>
    <h3>About the numbers</h3>
    <p>Costs, masses, power and data rates are simplified so the trade-offs are easy to see. They are not real engineering values. The trade-offs themselves are real.</p>
    <h3>Learn more from NASA</h3>
    <ul class="links">${LINKS.map(([name, url, why]) => `<li><a href="${url}" target="_blank" rel="noopener">${esc(name)}</a> <span>${esc(why)}</span></li>`).join('')}</ul>`;
  $('overlay').hidden = false;
}
$('overlay-body').onclick = (e) => {
  const b = e.target.closest('[data-ranks]');
  if (b) openRanks(b.dataset.ranks);
  if (e.target.closest('#edit-pilot')) { $('overlay').hidden = true; openProfile(); }
};
$('pilot-chip').onclick = openRecord;
$('pilot-card').onclick = (e) => { if (e.target.closest('#open-record')) openRecord(); };
$('overlay-close').onclick = () => { $('overlay').hidden = true; };
$('overlay').onclick = (e) => { if (e.target === $('overlay')) $('overlay').hidden = true; };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('overlay').hidden = true; });
$('open-ranks').onclick = () => openRanks(mission?.sandbox ? 'earth' : mission?.id);
$('open-about').onclick = openAbout;

$('launch').onclick = toPad;
$('skip').onclick = () => { if (answer) answer(EVENTS.quiet.choices[0].id); view.skip(); };
$('back').onclick = () => { if (session.mode === 'online') commit({ phase: 'brief' }); else { renderBrief(); show('brief', 0); view.setMode('menu'); } };
$('join-form').onsubmit = async (e) => {
  e.preventDefault();
  const code = $('join-code').value.trim().toUpperCase();
  if (/^[A-Z]{4}$/.test(code) && await net.roomExists(code)) enterRoom(code); else $('join-code').value = '', $('join-code').placeholder = 'No such room';
};

// ---------- start ----------
renderMenu();
online = await net.serverAvailable();
renderMenu();
const hash = new URLSearchParams(location.hash.slice(1));
// An invite link or a design link skips the title screen.
if (hash.get('room') && online && await net.roomExists(hash.get('room'))) { view.setMode('menu'); enterRoom(hash.get('room')); }
else if (hash.get('d')) {
  try {
    const shared = JSON.parse(atob(hash.get('d'))), mis = MISSIONS.find((x) => x.id === shared.m);
    if (mis && shared.c && shared.d) { view.setMode('menu'); openBrief(mis, shared); orbi('Shared design loaded.'); }
  } catch { /* not a valid design link: stay on the title screen */ }
}
if (screen() === 'title') $('press-start').focus();
