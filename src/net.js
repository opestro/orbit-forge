// Talks to server.mjs: team rooms and the shared rankings. Every call fails quietly when the game
// is served from a plain static host, and the game then offers solo and same-screen play only.
const post = (url, data) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

export async function serverAvailable() {
  try { return (await fetch('api/ping')).ok; } catch { return false; }
}

export async function createRoom(state) {
  const res = await post('api/rooms', state);
  if (!res.ok) throw new Error((await res.json()).error);
  return (await res.json()).code;
}

// Join a room. onState is called with the whole shared state every time anyone changes it.
export function joinRoom(code, me, onState, onLost) {
  const stream = new EventSource(`api/rooms/${code}/events?id=${encodeURIComponent(me.id)}&name=${encodeURIComponent(me.name)}`);
  stream.onmessage = (e) => onState(JSON.parse(e.data));
  stream.onerror = () => { if (stream.readyState === EventSource.CLOSED) onLost(); };
  return { code, send: (set) => post(`api/rooms/${code}`, { set }).catch(() => {}), close: () => stream.close() };
}

export async function roomExists(code) {
  try { return (await post(`api/rooms/${code}`, { set: {} })).ok; } catch { return false; }
}

export async function loadScores(mission) {
  try { return await (await fetch(`api/scores?mission=${encodeURIComponent(mission)}`)).json(); } catch { return null; }
}
export const saveScore = (entry) => post('api/scores', entry).then((r) => r.json()).catch(() => null);
