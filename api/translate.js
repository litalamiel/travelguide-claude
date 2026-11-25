// POST /api/translate  { text }  ->  { lang, text }
// Translates a caption to English. Uses Google Translate's public web endpoint,
// falling back to MyMemory. For production, switch to a keyed translation API.
async function google(text) {
  const u = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error('google');
  const d = await r.json();
  return { text: (d[0] || []).map((x) => x[0]).join(''), lang: d[2] };
}
async function mymemory(text) {
  const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=autodetect|en`);
  const d = await r.json();
  return { text: d.responseData?.translatedText, lang: d.responseData?.detectedLanguage };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const text = String(body?.text || '').slice(0, 4000);
  if (!text.trim()) return res.status(400).json({ error: 'Nothing to translate' });
  try {
    const out = await google(text).catch(() => mymemory(text));
    if (!out.text) throw new Error('empty');
    return res.status(200).json(out);
  } catch {
    return res.status(502).json({ error: 'Translation is unavailable right now.' });
  }
}
