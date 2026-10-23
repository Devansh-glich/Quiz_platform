// QuizLive server: Express (static files) + WebSocket (live state). State is saved to data.json.
const express = require('express'), http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000, ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DB = path.join(__dirname, 'data.json');
// Storage: D.quizzes = saved quiz templates, D.sessions = every launched run (own code, players, answers).
let D = { quizzes: {}, sessions: {} };
try { const raw = JSON.parse(fs.readFileSync(DB)); D = (raw.sessions || raw.quizzes) ? { quizzes: raw.quizzes || {}, sessions: raw.sessions || {} } : { quizzes: {}, sessions: raw }; } catch {}
const S = D.sessions;
// Debounced + atomic save: many answers arriving together -> one write; temp file + rename can't leave a half-written data.json
let timer = null;
function writeNow() { clearTimeout(timer); timer = null; try { fs.writeFileSync(DB + '.tmp', JSON.stringify(D)); fs.renameSync(DB + '.tmp', DB); } catch (e) { console.error('save failed:', e.message); } }
const save = () => { if (!timer) timer = setTimeout(writeNow, 300); };
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => { writeNow(); process.exit(); }));
const quizList = () => Object.values(D.quizzes).sort((a, b) => b.updated - a.updated);
const sessionList = () => Object.entries(S).map(([code, q]) => ({ code, title: q.title, status: q.status, players: Object.keys(q.players).length }));
function cleanQuiz(m) {
  const qs = Array.isArray(m.qs) ? m.qs.slice(0, 100).map(q => ({ q: String(q.q || '').trim().slice(0, 300),
    o: (Array.isArray(q.o) ? q.o : []).map(x => String(x).trim().slice(0, 150)).filter(Boolean).slice(0, 6), a: q.a | 0 })) : [];
  const title = String(m.title || '').trim().slice(0, 120);
  return (!title || !qs.length || qs.some(q => !q.q || q.o.length < 2 || q.a < 0 || q.a >= q.o.length)) ? null : { title, qs };
}
const app = express(); app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app), wss = new WebSocketServer({ server, maxPayload: 2e5 });
const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const mkCode = () => { let c; do c = Array.from({ length: 5 }, () => CH[crypto.randomInt(CH.length)]).join(''); while (S[c]); return c; };
const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));

// Scoring: 1000 per correct answer + up to 500 speed bonus (server timestamps, measured from question start)
function stats(s) {
  const per = s.qs.map((q, i) => Object.entries(s.players).filter(([, p]) => p.a[i]).map(([id, p]) => ({
    id, name: p.name, c: p.a[i].c, ok: p.a[i].c === q.a, ms: Math.max(0, p.a[i].t - (s.qStart[i] || p.a[i].t))
  })).sort((x, y) => x.ms - y.ms));
  const rows = Object.entries(s.players).map(([id, p]) => ({
    id, name: p.name,
    score: per.reduce((t, l) => { const r = l.find(x => x.id === id); return t + (r && r.ok ? 1000 + Math.max(0, 500 - Math.round(r.ms / 100)) : 0); }, 0)
  })).sort((a, b) => b.score - a.score);
  return { per, rows };
}
function playerView(s, pid) {
  const cur = s.cur, p = s.players[pid] || { a: {} }, live = cur >= 0 && s.status !== 'ended';
  const out = { t: 'play', title: s.title, n: s.qs.length, cur, status: s.status, name: p.name, mine: p.a,
    q: live ? { q: s.qs[cur].q, o: s.qs[cur].o } : null, rev: live && s.rev === cur ? s.qs[cur].a : null };
  if (s.status === 'ended' || out.rev !== null) out.board = stats(s).rows.slice(0, 50);
  return out;
}
const hostView = (code, s) => ({ t: 'host', code, title: s.title, qs: s.qs, cur: s.cur, status: s.status, rev: s.rev, ...stats(s) });
function broadcast(code) {
  const s = S[code]; if (!s) return;
  wss.clients.forEach(ws => { const c = ws.ctx; if (!c || c.code !== code) return;
    send(ws, c.admin ? hostView(code, s) : playerView(s, c.pid)); });
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

wss.on('connection', ws => {
  ws.ctx = {};
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const c = ws.ctx, s = S[c.code];
    if (m.t === 'admin') {
      if (safeEq(m.pw || '', ADMIN_PASSWORD)) { c.admin = true; send(ws, { t: 'admin_ok' }); } else send(ws, { t: 'error', msg: 'Wrong password' });
      return;
    }
    if (c.admin) {
      if (m.t === 'list') return send(ws, { t: 'list', items: sessionList() });
      if (m.t === 'quizzes') return send(ws, { t: 'quizzes', items: quizList() });
      if (m.t === 'delete_quiz') { delete D.quizzes[m.id]; save(); return send(ws, { t: 'quizzes', items: quizList() }); }
      if (m.t === 'relaunch' && S[m.code]) { // fresh run of the same quiz: new code, no players, no answers
        const o = S[m.code]; let id = o.quizId;
        if (!D.quizzes[id]) { id = crypto.randomUUID(); D.quizzes[id] = { id, title: o.title, qs: JSON.parse(JSON.stringify(o.qs)), updated: Date.now() }; o.quizId = id; }
        const code = mkCode();
        S[code] = { quizId: id, title: o.title, qs: JSON.parse(JSON.stringify(o.qs)), cur: -1, status: 'lobby', rev: null, qStart: {}, players: {} };
        c.code = code; save(); return broadcast(code);
      }
      if (m.t === 'delete_session') { delete S[m.code]; save(); return send(ws, { t: 'list', items: sessionList() }); }
      if (m.t === 'save_quiz' || m.t === 'launch') {
        let qz;
        if (m.t === 'launch') qz = D.quizzes[m.id];
        else { const v = cleanQuiz(m); if (!v) return send(ws, { t: 'error', msg: 'Invalid quiz' });
          const id = D.quizzes[m.id] ? m.id : crypto.randomUUID(); qz = D.quizzes[id] = { id, ...v, updated: Date.now() }; }
        if (!qz) return;
        if (m.t === 'save_quiz' && !m.launch) { save(); return send(ws, { t: 'saved' }); }
        const code = mkCode(); // every launch is a fresh run: new code, no players, no answers
        S[code] = { quizId: qz.id, title: qz.title, qs: JSON.parse(JSON.stringify(qz.qs)), cur: -1, status: 'lobby', rev: null, qStart: {}, players: {} };
        c.code = code; save(); return broadcast(code);
      }
      if (m.t === 'open' && S[m.code]) { c.code = m.code; return broadcast(m.code); }
      if (!s) return;
      if (m.t === 'next' && s.status !== 'ended') {
        if (s.cur >= s.qs.length - 1) { s.status = 'ended'; s.rev = null; }
        else { s.cur++; s.status = 'live'; s.rev = null; s.qStart[s.cur] = Date.now(); }
        save(); return broadcast(c.code);
      }
      if (m.t === 'reveal' && s.cur >= 0 && s.status === 'live') { s.rev = s.cur; save(); return broadcast(c.code); }
      return;
    }
    if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase(), js = S[code], pid = String(m.pid || '').slice(0, 64), name = String(m.name || '').trim().slice(0, 24);
      if (!js) return send(ws, { t: 'error', msg: 'No quiz found with that code.' });
      if (!name || !pid) return send(ws, { t: 'error', msg: 'Name required.' });
      js.players[pid] = js.players[pid] || { name, a: {} }; js.players[pid].name = name;
      ws.ctx = { code, pid }; save(); return broadcast(code);
    }
    if (m.t === 'answer' && s && c.pid) {
      const p = s.players[c.pid], i = m.i | 0; // one answer per question, enforced here
      if (!p || s.status !== 'live' || s.cur < 0 || s.rev === s.cur || p.a[s.cur] || i < 0 || i >= s.qs[s.cur].o.length) return;
      p.a[s.cur] = { c: i, t: Date.now() }; save(); broadcast(c.code);
    }
  });
});
server.listen(PORT, () => console.log(`QuizLive on http://localhost:${PORT}  (host: /#host, password: ${process.env.ADMIN_PASSWORD ? 'from ADMIN_PASSWORD' : 'admin123 — change it!'})`));
