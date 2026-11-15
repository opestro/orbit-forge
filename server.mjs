// Serves the game, runs team rooms (up to four players on their own devices) and keeps the shared rankings.
// No dependencies. Run with: node server.mjs [port]
// Without this server the game still works from any static host, with solo and same-screen team play.
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4788);
const SCORES = join(ROOT, 'scores.json');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const ROLE_IDS = ['science', 'engineer', 'comms', 'manager'];
const SHARED = ['mission', 'config', 'design', 'go', 'phase', 'flight', 'choice']; // the only things a player may change
const MAX_ROOMS = 200, MAX_BODY = 20000;

const rooms = new Map(); // code -> { state, clients: Map(response -> player id), touched }
let scores = [];
try { scores = JSON.parse(await readFile(SCORES, 'utf8')); } catch { /* no rankings saved yet */ }

// Roles are dealt round the table, so two players get two roles each and four get one each.
const dealRoles = (players) => Object.fromEntries(ROLE_IDS.map((role, i) => [role, players.length ? players[i % players.length].id : null]));
const clean = (text, max) => String(text ?? '').replace(/[<>&"']/g, '').slice(0, max).trim();
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

function broadcast(room) {
  room.touched = Date.now();
  room.state.version++;
  const line = `data: ${JSON.stringify(room.state)}\n\n`;
  for (const res of room.clients.keys()) res.write(line);
}

async function body(req) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > MAX_BODY) throw new Error('too large'); }
  return JSON.parse(text || '{}');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), path = url.pathname;
  try {
    if (path === '/api/ping') return json(res, 200, { ok: true });

    if (path === '/api/scores') {
      if (req.method === 'POST') {
        const s = await body(req);
        scores.push({ name: clean(s.name, 24) || 'Anonymous', mission: clean(s.mission, 16), goals: clean(s.goals, 80), level: clean(s.level, 16), points: Math.round(Number(s.points) || 0), stars: Math.round(Number(s.stars) || 0), team: Math.round(Number(s.team) || 1), at: Date.now() });
        scores = scores.sort((a, b) => b.points - a.points).slice(0, 500);
        await writeFile(SCORES, JSON.stringify(scores));
      }
      const mission = url.searchParams.get('mission');
      return json(res, 200, scores.filter((s) => !mission || s.mission === mission).slice(0, 25));
    }

    if (path === '/api/rooms' && req.method === 'POST') {
      if (rooms.size >= MAX_ROOMS) return json(res, 503, { error: 'Too many rooms right now.' });
      const first = await body(req);
      let code;
      do { code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join(''); } while (rooms.has(code));
      const state = { code, version: 0, players: [], owners: dealRoles([]), go: {}, phase: 'brief', flight: null, choice: null };
      for (const key of SHARED) if (key in first) state[key] = first[key];
      rooms.set(code, { state, clients: new Map(), touched: Date.now() });
      return json(res, 200, { code });
    }

    const match = path.match(/^\/api\/rooms\/([A-Z]{4})(\/events)?$/);
    if (match) {
      const room = rooms.get(match[1]);
      if (!room) return json(res, 404, { error: 'No room with that code.' });
      if (match[2]) { // a player connects and listens for changes
        const id = clean(url.searchParams.get('id'), 24), name = clean(url.searchParams.get('name'), 20) || 'Player';
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        room.clients.set(res, id);
        const s = room.state;
        if (id && !s.players.some((p) => p.id === id) && s.players.length < 4) { s.players.push({ id, name }); s.owners = dealRoles(s.players); s.go = {}; }
        broadcast(room);
        req.on('close', () => {
          room.clients.delete(res);
          if (![...room.clients.values()].includes(id)) { s.players = s.players.filter((p) => p.id !== id); s.owners = dealRoles(s.players); s.go = {}; broadcast(room); }
        });
        return;
      }
      if (req.method === 'POST') {
        const { set = {} } = await body(req);
        for (const key of SHARED) if (key in set) room.state[key] = set[key];
        broadcast(room);
        return json(res, 200, { ok: true });
      }
    }

    // Everything else is a file from the game folder.
    const file = normalize(join(ROOT, path === '/' ? 'index.html' : decodeURIComponent(path)));
    if (!file.startsWith(ROOT) || file.split(sep).some((part) => part.startsWith('.')) || file === SCORES) return json(res, 403, { error: 'Not allowed.' });
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    json(res, err.code === 'ENOENT' ? 404 : 400, { error: err.code === 'ENOENT' ? 'Not found.' : 'Bad request.' });
  }
});

// Keep connections alive, and forget rooms nobody has used for two hours.
setInterval(() => {
  for (const [code, room] of rooms) {
    for (const res of room.clients.keys()) res.write(': ping\n\n');
    if (!room.clients.size && Date.now() - room.touched > 2 * 3600e3) rooms.delete(code);
  }
}, 25000).unref();

server.listen(PORT, () => console.log(`Orbit Forge is running at http://localhost:${PORT}`));
