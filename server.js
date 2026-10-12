// Instrument table (Singapore, 20 October 2026): task force views + adjudicator console.
// Zero dependencies. Node 18+.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STORE = path.join(DATA_DIR, 'store.json');
const PUBLIC = path.join(__dirname, 'public');
const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-cards.json'), 'utf8'));

const RULES = { actMax: 3, depPerRound: 3, futMax: 3 };
const TF = { BIRD: 'Bird table', FLOWER: 'Flower table' };
const TF_KEYS = Object.keys(TF);
const otherOf = k => TF_KEYS.find(x => x !== k);
const ROUND_LABELS = { 1: 'Trigger', 2: 'Escalation', 3: 'Emergency' };
const PILES = { act: 'Activate', dep: 'Deprioritise', fut: 'Future interest' };
const STORE_VERSION = 2;
const CATS = ['Evidence', 'Authority', 'Coordination', 'Operational continuity'];
const VALUES = ['Useful', 'Partly useful', 'Mixed', 'Inert now, later value', 'Harmful', ''];

if (ADMIN_PASSWORD === 'change-me') console.warn('WARNING: ADMIN_PASSWORD is not set. Using the default "change-me".');

// ---------------------------------------------------------------- storage
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { version: STORE_VERSION, cards: seedCards(), cardsRev: 1, games: {} };
try {
  const loaded = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  if (loaded && loaded.version === STORE_VERSION && Array.isArray(loaded.cards)) db = loaded;
  else if (loaded) console.log('Saved data is from an older version of the app. Starting from the seed card library.');
  console.log(`Loaded ${db.cards.length} cards and ${Object.keys(db.games).length} games.`);
} catch (e) {
  console.log('No saved data found. Starting from the seed card library.');
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = STORE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(db), err => {
      if (err) return console.error('Save failed:', err.message);
      fs.rename(tmp, STORE, e => e && console.error('Rename failed:', e.message));
    });
  }, 250);
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function seedCards() { return SEED.cards.map(c => normaliseCard(c, c.id)); }

// ---------------------------------------------------------------- auth
const TOKEN = crypto.createHmac('sha256', ADMIN_PASSWORD).update('ttx-admin-v1').digest('hex');
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest(); }
function passwordOk(p) { return crypto.timingSafeEqual(sha(p), sha(ADMIN_PASSWORD)); }
function tokenOk(t) { t = String(t || ''); return t.length === TOKEN.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN)); }
const isAdmin = req => tokenOk(req.headers['x-admin-token']);

// ---------------------------------------------------------------- cards
const baseOf = id => id.endsWith('~2') ? id.slice(0, -2) : id;
const isExp = id => id.endsWith('~2');
const cardById = id => db.cards.find(c => c.id === id);
function slug(t) {
  const s = String(t || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'card';
  let id = s, n = 2;
  while (cardById(id)) id = `${s}-${n++}`;
  return id;
}
function gauge(v) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(-2, Math.min(2, n)) : 0; }
function normaliseCard(c, id) {
  const rounds = a => (Array.isArray(a) ? a : []).map(Number).filter(n => n >= 1 && n <= 3);
  const cats = (Array.isArray(c.cats) ? c.cats : []).map(k => CATS.find(x => x.toLowerCase() === String(k).toLowerCase())).filter(Boolean);
  return {
    id,
    print: Number.isFinite(+c.print) && c.print !== '' && c.print != null ? +c.print : null,
    working: Number.isFinite(+c.working) && c.working !== '' && c.working != null ? +c.working : null,
    title: String(c.title || 'Untitled instrument').slice(0, 200),
    cats: [...new Set(cats)].sort((a, b) => CATS.indexOf(a) - CATS.indexOf(b)),
    value: VALUES.includes(c.value) ? c.value : '',
    rounds: rounds(c.rounds),
    activate: { text: String(c.activate?.text || ''), readout: String(c.activate?.readout || ''), econ: gauge(c.activate?.econ), pol: gauge(c.activate?.pol) },
    expanded: {
      enabled: !!c.expanded?.enabled, rounds: rounds(c.expanded?.rounds),
      text: String(c.expanded?.text || ''), readout: String(c.expanded?.readout || ''), econ: gauge(c.expanded?.econ), pol: gauge(c.expanded?.pol),
    },
    hindsight: String(c.hindsight || ''),
  };
}
function front(card, exp) {
  return { id: exp ? card.id + '~2' : card.id, base: card.id, print: card.print, title: card.title, cats: card.cats, exp, text: exp ? card.expanded.text : card.activate.text };
}

// ---------------------------------------------------------------- games
function emptyTable() { return { items: {}, log: [] }; }
function newGame(code) {
  return {
    code, created: new Date().toISOString(), round: 0, phase: 'lobby',
    choiceRounds: [1, 2], returns: {}, hindsight: false, peek: false, v: 1,
    tables: Object.fromEntries(TF_KEYS.map(k => [k, emptyTable()])),
  };
}
function choicesOpen(g) { return g.phase === 'open' && g.choiceRounds.includes(g.round); }
function item(t, id) { return t.items[id] || (t.items[id] = { pile: null }); }
function visibleOnTable(g, tfKey) {
  const t = g.tables[tfKey], r = g.round || 1, out = [];
  for (const c of db.cards) {
    const it = t.items[c.id];
    if (c.rounds.includes(r) || (it && it.pile)) out.push(c.id);
  }
  for (const c of db.cards) {
    const base = t.items[c.id], it = t.items[c.id + '~2'];
    const eligible = c.expanded.enabled && c.expanded.rounds.includes(r) && base && base.actRound && base.actRound < r;
    if (eligible || (it && it.pile)) out.push(c.id + '~2');
  }
  return out;
}
function instrumentsIn(t, pile, excludeBase) {
  const s = new Set();
  for (const [id, it] of Object.entries(t.items)) if (it.pile === pile && baseOf(id) !== excludeBase && cardById(baseOf(id))) s.add(baseOf(id));
  return s.size;
}
function depThisRound(t, r, excludeId) {
  return Object.entries(t.items).filter(([id, it]) => id !== excludeId && it.pile === 'dep' && it.pileRound === r && cardById(baseOf(id))).length;
}
function checkPile(g, t, id, pile) {
  const r = g.round;
  if (!choicesOpen(g)) return g.phase === 'closed' ? 'This round is closed. Choices are locked.' : 'There are no instrument choices right now.';
  const it = item(t, id);
  if (it.pile === pile) return null;
  if (isExp(id)) {
    const base = t.items[baseOf(id)];
    if (!base || !base.actRound || base.actRound >= r) return 'Playable only if your task force has already activated this instrument in a previous round.';
  }
  if (it.pile === 'dep' && it.pileRound < r && pile !== 'act') return 'Previously deprioritised cards can only come back by being activated.';
  if (pile === 'act' && instrumentsIn(t, 'act', baseOf(id)) >= RULES.actMax) {
    const wasDep = it.pile === 'dep' && it.pileRound < r;
    return 'Activate already holds three instruments. Move one out first.' + (wasDep ? ' To activate a previously deprioritised card, give up one of your activated cards.' : '');
  }
  if (pile === 'dep' && depThisRound(t, r, id) >= RULES.depPerRound) return 'You have already deprioritised three this round.';
  if (pile === 'fut' && instrumentsIn(t, 'fut', baseOf(id)) >= RULES.futMax) return 'Future interest already holds three.';
  return null;
}
function logMove(g, t, id, from, to, who) {
  const c = cardById(baseOf(id));
  t.log.push({ t: new Date().toISOString(), round: g.round, card: (c ? c.title : id) + (isExp(id) ? ' (Expanded)' : ''), from: from ? PILES[from] : 'Table', to: to ? PILES[to] : 'Table', who: String(who || '').slice(0, 12) });
}
function applyAction(g, tfKey, a) {
  const t = g.tables[tfKey];
  if (!t) return 'Unknown task force.';
  if (a.type !== 'pile') return 'Unknown action.';
  const id = String(a.id || '');
  if (!cardById(baseOf(id))) return 'That card is no longer in the deck.';
  if (!visibleOnTable(g, tfKey).includes(id)) return 'That card is not available this round.';
  const it = item(t, id);
  const pile = a.pile || null;
  if (pile && !PILES[pile]) return 'Unknown pile.';
  if (!pile) {
    if (!it.pile) return null;
    if (!choicesOpen(g)) return 'Choices are locked.';
    if (it.pile === 'dep' && it.pileRound < g.round) return 'Previously deprioritised cards can only come back by being activated.';
    logMove(g, t, id, it.pile, null, a.who);
    if (it.pile === 'act' && !isExp(id) && it.actRound === g.round) it.actRound = null;
    it.pile = null; it.pileRound = null;
    return null;
  }
  const err = checkPile(g, t, id, pile); if (err) return err;
  if (it.pile === pile) return null;
  if (it.pile === 'act' && !isExp(id) && it.actRound === g.round) it.actRound = null;
  logMove(g, t, id, it.pile, pile, a.who);
  it.pile = pile; it.pileRound = g.round;
  if (pile === 'act' && !isExp(id) && !it.actRound) it.actRound = g.round;
  return null;
}

// readouts: one per instrument activated or expanded this round, from the card library
function computeReturns(g, r) {
  const out = {};
  for (const tfKey of TF_KEYS) {
    const t = g.tables[tfKey], lines = [];
    const entries = Object.entries(t.items).filter(([id, it]) => it.pile === 'act' && cardById(baseOf(id)));
    entries.sort((a, b) => (cardById(baseOf(a[0])).print ?? 99) - (cardById(baseOf(b[0])).print ?? 99) || (isExp(a[0]) ? 1 : 0) - (isExp(b[0]) ? 1 : 0));
    for (const [id, it] of entries) {
      const c = cardById(baseOf(id));
      if (isExp(id)) {
        if (it.pileRound === r) lines.push({ id, kind: 'Expanded', title: c.title, cats: c.cats, text: c.expanded.readout, econ: c.expanded.econ, pol: c.expanded.pol });
      } else if (it.actRound === r) {
        lines.push({ id, kind: 'Activated', title: c.title, cats: c.cats, text: c.activate.readout, econ: c.activate.econ, pol: c.activate.pol });
      }
    }
    const titlesIn = (pile, onlyThisRound) => Object.entries(t.items)
      .filter(([id, it]) => it.pile === pile && cardById(baseOf(id)) && (!onlyThisRound || it.pileRound === r))
      .sort((a, b) => (cardById(baseOf(a[0])).print ?? 99) - (cardById(baseOf(b[0])).print ?? 99))
      .map(([id, it]) => ({ title: cardById(baseOf(id)).title + (isExp(id) ? ' (Expanded)' : ''), cats: cardById(baseOf(id)).cats, round: it.pileRound }));
    const act = titlesIn('act'), dep = titlesIn('dep', true), fut = titlesIn('fut');
    const notes = [];
    if (dep.length < RULES.depPerRound) notes.push(`Deprioritised ${dep.length} of ${RULES.depPerRound} this round.`);
    out[tfKey] = { lines, act, dep, fut, notes };
  }
  return out;
}
// a round's readouts reach the tables when the facilitator opens the following round (or ends the exercise)
function readoutsReleased(g, r) { return !!g.returns[r] && g.choiceRounds.includes(r) && (g.round > r || g.phase === 'ended'); }
// a round is closed (and so visible in the other-table window) once its returns exist and it is not open again
function roundClosed(g, r) { return !!g.returns[r] && !(g.phase === 'open' && g.round === r); }
function hindsightFor(g, tfKey) {
  const t = g.tables[tfKey];
  return db.cards.filter(c => t.items[c.id]?.actRound && c.hindsight).map(c => ({ id: c.id, print: c.print, title: c.title, cats: c.cats, text: c.hindsight, round: t.items[c.id].actRound }));
}
function totals(g, tfKey) {
  const byRound = {}; let econ = 0, pol = 0;
  for (const r of Object.keys(g.returns).map(Number).sort()) {
    const L = g.returns[r][tfKey]?.lines || [];
    const e = L.reduce((s, l) => s + (l.econ || 0), 0), p = L.reduce((s, l) => s + (l.pol || 0), 0);
    byRound[r] = { econ: e, pol: p }; econ += e; pol += p;
  }
  return { econ, pol, byRound };
}

// participant view: fronts only; readouts once released; never designer values or totals
function participantState(g, tfKey) {
  const t = g.tables[tfKey], other = otherOf(tfKey);
  const cards = visibleOnTable(g, tfKey).map(id => {
    const c = cardById(baseOf(id)), it = t.items[id] || {};
    return { ...front(c, isExp(id)), pile: it.pile || null, pileRound: it.pileRound || null };
  });
  const readouts = Object.keys(g.returns).map(Number).sort().filter(r => readoutsReleased(g, r))
    .map(r => ({ round: r, label: ROUND_LABELS[r] || '', lines: g.returns[r][tfKey].lines.map(l => ({ kind: l.kind, title: l.title, cats: l.cats, text: l.text, econ: l.econ, pol: l.pol })) }));
  const peek = g.peek ? Object.keys(g.returns).map(Number).sort().filter(r => roundClosed(g, r) && g.choiceRounds.includes(r))
    .map(r => { const o = g.returns[r][other]; return { round: r, label: ROUND_LABELS[r] || '', act: o.act, dep: o.dep, fut: o.fut }; }) : null;
  return {
    code: g.code, tf: tfKey, tfName: TF[tfKey], otherName: TF[other], round: g.round, roundLabel: ROUND_LABELS[g.round] || '', phase: g.phase,
    choices: choicesOpen(g), rules: RULES, cards, readouts, peek,
    hindsight: g.hindsight ? hindsightFor(g, tfKey) : null, v: g.v,
    counts: { act: instrumentsIn(t, 'act'), dep: depThisRound(t, g.round), fut: instrumentsIn(t, 'fut') },
  };
}
function adminGame(g) {
  const tables = {};
  for (const k of TF_KEYS) {
    const t = g.tables[k];
    const list = pile => Object.entries(t.items).filter(([id, it]) => it.pile === pile && cardById(baseOf(id)))
      .sort((a, b) => (cardById(baseOf(a[0])).print ?? 99) - (cardById(baseOf(b[0])).print ?? 99))
      .map(([id, it]) => ({ id, title: cardById(baseOf(id)).title + (isExp(id) ? ' (Expanded)' : ''), cats: cardById(baseOf(id)).cats, round: it.pileRound }));
    tables[k] = { name: TF[k], act: list('act'), dep: list('dep'), fut: list('fut'), counts: { act: instrumentsIn(t, 'act'), dep: depThisRound(t, g.round), fut: instrumentsIn(t, 'fut') }, moves: t.log.length, totals: totals(g, k), hindsightCount: hindsightFor(g, k).length };
  }
  const released = Object.keys(g.returns).map(Number).filter(r => readoutsReleased(g, r));
  return { code: g.code, created: g.created, round: g.round, roundLabel: ROUND_LABELS[g.round] || '', phase: g.phase, choiceRounds: g.choiceRounds, returns: g.returns, released, hindsight: g.hindsight, peek: g.peek, tables, v: g.v };
}

// ---------------------------------------------------------------- live updates (server-sent events)
const streams = new Map(); // code -> Set(res); '*' for admin listeners
function subscribe(key, res) { if (!streams.has(key)) streams.set(key, new Set()); streams.get(key).add(res); }
function unsubscribe(key, res) { streams.get(key)?.delete(res); }
function notify(key, v) { for (const res of streams.get(key) || []) res.write(`data: ${JSON.stringify({ v })}\n\n`); }
function touch(g) { g.v = (g.v || 0) + 1; save(); notify(g.code, g.v); notify('*', g.v); }
function touchCards() { db.cardsRev = (db.cardsRev || 0) + 1; save(); for (const g of Object.values(db.games)) { g.v++; notify(g.code, g.v); } notify('*', db.cardsRev); }
setInterval(() => { for (const set of streams.values()) for (const res of set) res.write(': ping\n\n'); }, 25000);

// ---------------------------------------------------------------- http helpers
function send(res, code, obj) { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(b); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 2e6) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin') pathname = '/admin.html';
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}
const cleanCode = c => String(c || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);

// ---------------------------------------------------------------- routes
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname, m = req.method;
  try {
    if (p === '/healthz') return send(res, 200, { ok: true });

    // live stream
    if (p === '/api/events') {
      const key = u.searchParams.get('admin') ? (tokenOk(u.searchParams.get('token')) ? '*' : null) : cleanCode(u.searchParams.get('code'));
      if (!key) { res.writeHead(403); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      subscribe(key, res); req.on('close', () => unsubscribe(key, res));
      return;
    }

    // ----- participant API
    let mm;
    if ((mm = p.match(/^\/api\/game\/([a-z0-9-]+)\/state$/)) && m === 'GET') {
      const g = db.games[mm[1]]; if (!g) return send(res, 404, { error: 'No exercise with that code. Check the code with your facilitator.' });
      const tf = u.searchParams.get('tf'); if (!TF[tf]) return send(res, 400, { error: 'Choose your table.' });
      return send(res, 200, participantState(g, tf));
    }
    if ((mm = p.match(/^\/api\/game\/([a-z0-9-]+)\/action$/)) && m === 'POST') {
      const g = db.games[mm[1]]; if (!g) return send(res, 404, { error: 'No exercise with that code.' });
      const b = await readBody(req); if (!TF[b.tf]) return send(res, 400, { error: 'Unknown table.' });
      const err = applyAction(g, b.tf, b);
      if (!err) touch(g);
      return send(res, err ? 409 : 200, { error: err || null, state: participantState(g, b.tf) });
    }

    // ----- admin API
    if (p === '/api/admin/login' && m === 'POST') {
      const b = await readBody(req);
      if (!passwordOk(b.password || '')) return send(res, 401, { error: 'Wrong password.' });
      return send(res, 200, { token: TOKEN });
    }
    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'Log in again.' });

      if (p === '/api/admin/cards' && m === 'GET') return send(res, 200, { cards: db.cards, rev: db.cardsRev });
      if (p === '/api/admin/cards' && m === 'POST') {
        const b = await readBody(req);
        const maxPrint = Math.max(0, ...db.cards.map(c => c.print || 0));
        const card = normaliseCard({ title: b.title || 'New instrument', print: maxPrint + 1, cats: ['Evidence'], rounds: [1, 2], activate: {}, expanded: { enabled: true, rounds: [2] } }, slug(b.title || 'new-instrument'));
        db.cards.push(card); touchCards(); return send(res, 200, { card });
      }
      if (p === '/api/admin/cards/import' && m === 'POST') {
        const b = await readBody(req);
        const list = Array.isArray(b.cards) ? b.cards : null; if (!list) return send(res, 400, { error: 'The file has no "cards" list.' });
        const seen = new Set();
        db.cards = list.map(c => { let id = cleanCode(c.id) || slug(c.title); while (seen.has(id)) id += '-x'; seen.add(id); return normaliseCard(c, id); });
        touchCards(); return send(res, 200, { count: db.cards.length });
      }
      if (p === '/api/admin/cards/reset' && m === 'POST') { db.cards = seedCards(); touchCards(); return send(res, 200, { count: db.cards.length }); }
      if (p === '/api/admin/cards/order' && m === 'POST') {
        const b = await readBody(req); const ids = Array.isArray(b.ids) ? b.ids : [];
        db.cards.sort((a, c) => ids.indexOf(a.id) - ids.indexOf(c.id)); touchCards(); return send(res, 200, { ok: true });
      }
      if ((mm = p.match(/^\/api\/admin\/cards\/([a-z0-9-]+)$/))) {
        const i = db.cards.findIndex(c => c.id === mm[1]); if (i < 0) return send(res, 404, { error: 'Card not found.' });
        if (m === 'PUT') { const b = await readBody(req); db.cards[i] = normaliseCard(b, db.cards[i].id); touchCards(); return send(res, 200, { card: db.cards[i] }); }
        if (m === 'DELETE') { db.cards.splice(i, 1); touchCards(); return send(res, 200, { ok: true }); }
      }

      if (p === '/api/admin/games' && m === 'GET') return send(res, 200, { games: Object.values(db.games).map(g => ({ code: g.code, created: g.created, round: g.round, phase: g.phase })).sort((a, b) => b.created.localeCompare(a.created)) });
      if (p === '/api/admin/games' && m === 'POST') {
        const b = await readBody(req); const code = cleanCode(b.code);
        if (!code) return send(res, 400, { error: 'Enter a code using letters, numbers or hyphens.' });
        if (db.games[code]) return send(res, 409, { error: 'An exercise with that code already exists.' });
        db.games[code] = newGame(code); touch(db.games[code]); return send(res, 200, { game: adminGame(db.games[code]) });
      }
      if ((mm = p.match(/^\/api\/admin\/games\/([a-z0-9-]+)(\/[a-z-]+)?$/))) {
        const g = db.games[mm[1]]; if (!g) return send(res, 404, { error: 'Exercise not found.' });
        const sub = mm[2] || '';
        if (sub === '' && m === 'GET') return send(res, 200, { game: adminGame(g) });
        if (sub === '' && m === 'DELETE') { delete db.games[g.code]; save(); notify('*', 0); return send(res, 200, { ok: true }); }
        if (sub === '/control' && m === 'POST') {
          const b = await readBody(req);
          if (b.action === 'open') { const r = +b.round; if (r < 1 || r > 3) return send(res, 400, { error: 'Round must be 1, 2 or 3.' }); g.round = r; g.phase = 'open'; }
          else if (b.action === 'close') { if (g.phase !== 'open') return send(res, 409, { error: 'No round is open.' }); g.phase = 'closed'; g.returns[g.round] = computeReturns(g, g.round); }
          else if (b.action === 'recompute') { if (!g.round) return send(res, 409, { error: 'No round yet.' }); g.returns[g.round] = computeReturns(g, g.round); }
          else if (b.action === 'end') { g.phase = 'ended'; }
          else if (b.action === 'choices') { g.choiceRounds = (Array.isArray(b.rounds) ? b.rounds : []).map(Number).filter(n => n >= 1 && n <= 3); }
          else if (b.action === 'hindsight') { g.hindsight = !!b.on; }
          else if (b.action === 'peek') { g.peek = !!b.on; }
          else if (b.action === 'reset-table') { if (!TF[b.tf]) return send(res, 400, { error: 'Unknown table.' }); g.tables[b.tf] = emptyTable(); }
          else return send(res, 400, { error: 'Unknown action.' });
          touch(g); return send(res, 200, { game: adminGame(g) });
        }
        if (sub === '/returns' && m === 'PUT') {
          const b = await readBody(req); const ret = g.returns[+b.round]?.[b.tf];
          if (!ret || !ret.lines[+b.index]) return send(res, 404, { error: 'Readout not found.' });
          ret.lines[+b.index].text = String(b.text || '').slice(0, 2000); touch(g); return send(res, 200, { ok: true });
        }
        if (sub === '/log' && m === 'GET') {
          const rows = [['time', 'table', 'round', 'card', 'from', 'to', 'client']];
          for (const k of TF_KEYS) for (const l of g.tables[k].log) rows.push([l.t, TF[k], l.round, l.card, l.from, l.to, l.who]);
          const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ttx-${g.code}-moves.csv"` });
          return res.end(csv);
        }
      }
      return send(res, 404, { error: 'Not found.' });
    }

    if (m === 'GET') return serveStatic(req, res, p);
    res.writeHead(405); res.end();
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message || 'Server error.' });
  }
});

server.listen(PORT, () => console.log(`Instrument table running on port ${PORT}. Admin console at /admin`));
