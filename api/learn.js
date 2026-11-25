// The learning memory for reel place detection.
//   GET  /api/learn?action=status                 -> { memory, ai }  (which parts are switched on)
//   GET  /api/learn?action=recall&code=XXXX       -> { answers: [...] }  confirmed places for this reel (shared memory)
//   POST /api/learn?action=log   { lesson }       -> saves the app's first guess and what the user kept
//   GET  /api/learn?action=stats[&token=…]        -> the accuracy score (+ misses and creators with the token)
//   GET  /api/learn?action=export&token=…[&format=chat][&images=1]  -> every lesson as JSONL, for training a model later
// Works only when Supabase is set up (see LEARNING.md). Without it, every call answers { enabled: false }.
import { db, cors, readBody, CATEGORY_IDS } from './_lib/db.js';

const CODE = /^[\w-]{5,40}$/;
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : undefined);

/** A place as the app sends it, trimmed to what we keep. */
function cleanPlace(p) {
  if (!p || typeof p !== 'object') return null;
  const lat = num(p.lat), lng = num(p.lng);
  const name = str(p.name, 200);
  if (!name || lat === undefined || lng === undefined) return null;
  return { name, address: str(p.address, 300), lat, lng, category: CATEGORY_IDS.includes(p.category) ? p.category : undefined, osm: str(p.osm, 80), cc: str(p.cc, 4) };
}

const metres = (a, b) => {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const sameName = (a, b) => a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
export const samePlace = (a, b) => Boolean(a && b && (metres(a, b) < 150 || (sameName(a, b) && metres(a, b) < 3000)));

/** Keep a JSON object only when it's small (Claude's reading is a few hundred bytes). */
const smallJson = (v, max) => {
  if (!v || typeof v !== 'object') return null;
  const s = JSON.stringify(v);
  return s.length <= max ? v : null;
};

const isAdmin = (req, q) => {
  const want = process.env.LEARN_ADMIN_TOKEN;
  if (!want) return false;
  const got = q.get('token') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return got === want;
};

async function log(req, res) {
  const b = await readBody(req);
  const shortcode = str(b.shortcode, 40);
  if (!shortcode || !CODE.test(shortcode)) return res.status(400).json({ error: 'shortcode' });
  const guess = cleanPlace(b.guess);
  const final = cleanPlace(b.final);
  const place_correct = guess && final ? samePlace(guess, final) : false;
  const category_correct = guess && final ? guess.category === final.category : false;
  const outcome = !final ? 'rejected' : place_correct && category_correct ? 'confirmed' : 'fixed';
  const thumb = typeof b.thumb === 'string' && b.thumb.startsWith('data:image/') && b.thumb.length < 60_000 ? b.thumb : undefined;
  const row = {
    shortcode,
    author: str(b.author, 60)?.replace(/^@/, ''),
    caption: str(b.caption, 4000),
    caption_en: str(b.captionEn, 4000),
    thumb,
    flow: b.flow === 'bulk' ? 'bulk' : 'single',
    method: ['memory', 'ai', 'rules', 'none'].includes(b.method) ? b.method : 'rules',
    guess, final, outcome, place_correct, category_correct,
    ai: smallJson(b.ai, 8000),
    client_id: str(b.clientId, 40),
    app_version: str(b.appVersion, 40),
  };
  await db.insert('reel_lessons', [row]);
  return res.status(200).json({ ok: true, outcome });
}

async function recall(q, res) {
  const code = q.get('code') || '';
  if (!CODE.test(code)) return res.status(400).json({ error: 'code' });
  // A reel's answer is trusted once confirmed; with several different answers, the most-confirmed wins.
  const rows = (await db.select('reel_answers', `shortcode=eq.${encodeURIComponent(code)}&order=confirmations.desc,last_confirmed.desc&limit=6`))
    .filter((r) => Number(r.confirmations) > Number(r.rejections));
  res.setHeader('Cache-Control', 's-maxage=60');
  return res.status(200).json({ enabled: true, answers: rows.map((r) => ({ name: r.name, lat: r.lat, lng: r.lng, category: r.category, address: r.address, confirmations: r.confirmations })) });
}

async function stats(req, q, res) {
  const [summary, daily] = await Promise.all([
    db.select('accuracy_summary', 'select=*'),
    db.select('accuracy_daily', 'select=*&limit=120'),
  ]);
  const out = { enabled: true, summary, daily };
  if (isAdmin(req, q)) {
    const [misses, creators] = await Promise.all([
      db.select('recent_misses', 'select=*&limit=50'),
      db.select('creator_habits', 'select=*&order=lessons.desc&limit=30'),
    ]);
    Object.assign(out, { misses, creators });
  }
  return res.status(200).json(out);
}

async function exportAll(req, q, res) {
  if (!isAdmin(req, q)) return res.status(401).json({ error: 'Add ?token=<LEARN_ADMIN_TOKEN> to the link.' });
  const images = q.get('images') === '1';
  const chat = q.get('format') === 'chat';
  const cols = `shortcode,author,caption,caption_en,flow,method,guess,final,outcome,place_correct,category_correct,created_at${images ? ',thumb' : ''}`;
  const lines = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const rows = await db.select('reel_lessons', `select=${cols}&order=created_at.asc&limit=1000&offset=${from}`);
    for (const r of rows) {
      if (chat) {
        if (!r.final) continue;
        const user = [`Creator: @${r.author || 'unknown'}`, `Caption:\n${r.caption || ''}`, r.caption_en ? `English:\n${r.caption_en}` : ''].filter(Boolean).join('\n\n');
        const content = images && r.thumb ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: r.thumb.split(',')[1] } }, { type: 'text', text: user }] : user;
        lines.push(JSON.stringify({ messages: [
          { role: 'user', content },
          { role: 'assistant', content: JSON.stringify({ name: r.final.name, address: r.final.address, category: r.final.category }) },
        ] }));
      } else lines.push(JSON.stringify(r));
    }
    if (rows.length < 1000) break;
  }
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="reel-lessons${chat ? '-chat' : ''}.jsonl"`);
  return res.status(200).send(lines.join('\n') + '\n');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const q = new URL(req.url, 'http://x').searchParams;
  const action = q.get('action') || 'status';
  const ai = Boolean(process.env.ANTHROPIC_API_KEY);
  if (action === 'status') {
    // `check` says whether the memory really answers (e.g. the SQL wasn't run, or the wrong key was pasted).
    let check = 'off';
    if (db.enabled) {
      try { await db.select('reel_lessons', 'select=id&limit=1'); check = 'ok'; }
      catch (e) { check = String(e.message || e).slice(0, 300); }
    }
    return res.status(200).json({ memory: db.enabled, ai, check });
  }
  if (!db.enabled) return res.status(200).json({ enabled: false, answers: [] });
  try {
    if (action === 'log' && req.method === 'POST') return await log(req, res);
    if (action === 'recall') return await recall(q, res);
    if (action === 'stats') return await stats(req, q, res);
    if (action === 'export') return await exportAll(req, q, res);
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'The learning memory didn’t respond.', detail: String(e.message || e).slice(0, 300) });
  }
}
