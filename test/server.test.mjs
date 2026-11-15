// Run with: node test/server.test.mjs
// Starts the game server on a spare port and plays two players joining one room.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 4899, base = `http://localhost:${PORT}`;
const server = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url)), String(PORT)], { stdio: 'ignore' });
const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

// Listen to a room the way a browser does, and hand back each new state as it arrives.
async function listen(code, id, name) {
  const res = await fetch(`${base}/api/rooms/${code}/events?id=${id}&name=${name}`), reader = res.body.getReader(), text = new TextDecoder();
  let buffer = '';
  return {
    async next() {
      for (;;) {
        const end = buffer.indexOf('\n\n');
        if (end >= 0) { const line = buffer.slice(0, end); buffer = buffer.slice(end + 2); if (line.startsWith('data: ')) return JSON.parse(line.slice(6)); continue; }
        buffer += text.decode((await reader.read()).value);
      }
    },
    close: () => reader.cancel(),
  };
}

try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(base + '/api/ping')).ok) break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

  const { code } = await (await post('/api/rooms', { mission: 'storm', config: { level: 'standard', goals: ['hurricanes'] }, design: { instruments: [] }, phase: 'brief' })).json();
  assert.match(code, /^[A-Z]{4}$/);

  // Two players join: roles are dealt round the table, two each.
  const ana = await listen(code, 'ana1', 'Ana');
  let s = await ana.next();
  assert.deepEqual(s.players.map((p) => p.name), ['Ana']);
  assert.ok(Object.values(s.owners).every((id) => id === 'ana1'));
  const ben = await listen(code, 'ben2', 'Ben');
  s = await ben.next();
  assert.equal(s.players.length, 2);
  assert.deepEqual(s.owners, { science: 'ana1', engineer: 'ben2', comms: 'ana1', manager: 'ben2' });
  assert.equal((await ana.next()).players.length, 2, 'the first player hears about the second');

  // A change by one player reaches the other. Only shared keys can be changed.
  await post(`/api/rooms/${code}`, { set: { design: { instruments: ['weather'] }, go: { science: true }, players: [], owners: {} } });
  s = await ben.next();
  assert.deepEqual(s.design.instruments, ['weather']);
  assert.equal(s.go.science, true);
  assert.equal(s.players.length, 2, 'a player cannot rewrite the player list');

  // Launch and the in-flight decision are shared too.
  await post(`/api/rooms/${code}`, { set: { phase: 'flight', flight: { n: 1, eventId: 'meteor' } } });
  assert.equal((await ana.next(), await ana.next()).flight.eventId, 'meteor');

  // When a player leaves, their roles pass to whoever is left.
  ben.close();
  for (;;) { s = await ana.next(); if (s.players.length === 1) break; }
  assert.ok(Object.values(s.owners).every((id) => id === 'ana1'));
  ana.close();

  // Safety: unknown rooms, and files outside the game folder.
  assert.equal((await post('/api/rooms/ZZZZ', { set: {} })).status, 404);
  assert.notEqual((await fetch(base + '/%2e%2e/%2e%2e/etc/passwd')).status, 200);
  assert.notEqual((await fetch(base + '/scores.json')).status, 200);
  assert.ok((await fetch(base + '/index.html')).ok);
  assert.ok(Array.isArray(await (await fetch(base + '/api/scores?mission=storm')).json()));

  console.log('team server OK');
} finally {
  server.kill();
}
