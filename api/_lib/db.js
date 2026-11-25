// Tiny Supabase client for the serverless functions (REST, no extra package).
// Needs SUPABASE_URL and SUPABASE_SECRET_KEY (or the older SUPABASE_SERVICE_ROLE_KEY) in Vercel.
// Without them, `db.enabled` is false and the learning features switch off quietly.

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const headers = (extra = {}) => ({
  apikey: KEY,
  // Older service_role keys are JWTs and go in Authorization too; new sb_secret_ keys go only in apikey.
  ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}),
  'Content-Type': 'application/json',
  ...extra,
});

async function call(path, init = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: headers(init.headers) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export const db = {
  enabled: Boolean(URL_ && KEY),
  select: (table, query) => call(`${table}?${query}`),
  insert: (table, rows) => call(table, { method: 'POST', body: JSON.stringify(rows), headers: { Prefer: 'return=minimal' } }),
  rpc: (fn, args) => call(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }),
};

export const CATEGORY_IDS = ['eat', 'coffee', 'drinks', 'sights', 'views', 'nature', 'beaches', 'museums', 'shopping', 'experiences', 'stay'];

export async function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  return body && typeof body === 'object' ? body : {};
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
}
