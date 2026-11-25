// POST /api/ai-place  { shortcode, caption, captionEn?, author?, images?: [dataURL…] }
//   -> { enabled, places: [{ name, area, country, category, confidence, evidence }], examples, model }
// Claude reads the reel's caption and pictures (cover and key frames: text on screen, signs, logos)
// and names the place(s) the reel is about. Before it guesses, it's shown the most similar reels
// people already confirmed or fixed (from the learning memory), so it gets better as lessons pile up.
// Needs ANTHROPIC_API_KEY in Vercel. Without it, answers { enabled: false } and the app uses its own rules.
import Anthropic from '@anthropic-ai/sdk';
import { db, cors, readBody, CATEGORY_IDS } from './_lib/db.js';

export const config = { maxDuration: 60 };

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'].includes(process.env.ANTHROPIC_EFFORT) ? process.env.ANTHROPIC_EFFORT : 'low';
// Server-side fallback (another model answers if this one declines) works on these models.
const FALLBACK_OK = /^claude-(opus-5|opus-5-5|fable-5-[12]|sonnet-5-5)$/.test(MODEL);

const SYSTEM = `You read Instagram travel reels and name the real places they show, so a travel map app can pin them.

You get the caption (sometimes with an English translation), the creator's handle, and pictures from the reel: the cover and key frames. Pictures often carry the answer as text on screen, a sign, a menu, a logo, or a famous landmark.

How to answer:
- Name each specific place a traveller could go to: a hotel, restaurant, café, bar, beach, viewpoint, trail, museum, shop, park or activity. Not a whole country, and a city only when the reel is about the city itself.
- Use the place's own name as it appears on maps (e.g. "Hotel Neuhaus", not "this amazing family hotel"). Drop emoji, hashtags and flags.
- area: the town or region the place is in, as precisely as you can tell. country: the country in English.
- Signals, strongest first: a 📍 pin line; "at/in <Name>"; the creator's @-tag of the place; text in the pictures; hashtags; context.
- category is one of: eat (restaurants, food), coffee (cafés, bakeries, breakfast), drinks (bars, wineries), sights (castles, churches, old towns, landmarks), views (viewpoints, lookouts), nature (hikes, lakes, waterfalls, parks, mountains), beaches, museums, shopping (markets, shops), experiences (tours, activities, theme parks, cable cars, kids' attractions), stay (hotels, resorts, holiday homes).
- confidence: high when the caption or pictures name the place outright; medium when it's a strong inference; low when it's a guess. Never invent a name you can't see or infer.
- Put the place the reel is mainly about first. List at most 6 places. If the reel shows no identifiable place, return an empty list.
- The "Past lessons" are reels people already checked by hand. Follow their lead: how this creator writes captions, which category people chose for similar reels, and the corrections they made to earlier wrong guesses.
- evidence: a few words on what told you (e.g. "📍 line", "sign in frame 2").`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['places'],
  properties: {
    places: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'area', 'country', 'category', 'confidence', 'evidence'],
        properties: {
          name: { type: 'string' },
          area: { type: 'string' },
          country: { type: 'string' },
          category: { type: 'string', enum: CATEGORY_IDS },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          evidence: { type: 'string' },
        },
      },
    },
  },
};

const IMG = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

async function pastLessons(caption, author) {
  if (!db.enabled) return [];
  try {
    return await db.rpc('similar_lessons', { q: caption.slice(0, 2000), who: author || null, k: 6 });
  } catch (e) { console.error(e); return []; }
}

function lessonText(rows) {
  if (!rows.length) return '';
  const lines = rows.map((r, i) => {
    const ans = r.final ? `${r.final.name}${r.final.address ? ` (${r.final.address})` : ''} — ${r.final.category}` : 'none';
    const wrong = r.outcome === 'fixed' && r.guess ? `\n  The app first guessed "${r.guess.name}" (${r.guess.category}), which was wrong.` : '';
    return `${i + 1}. @${r.author || 'unknown'}: "${(r.caption || '').replace(/\s+/g, ' ').slice(0, 400)}"\n  Answer: ${ans}${wrong}`;
  });
  return `Past lessons (reels people checked by hand):\n${lines.join('\n')}`;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ enabled: false, places: [] });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = await readBody(req);
  const caption = typeof b.caption === 'string' ? b.caption.slice(0, 4000) : '';
  const author = typeof b.author === 'string' ? b.author.replace(/^@/, '').slice(0, 60) : '';
  const english = typeof b.captionEn === 'string' ? b.captionEn.slice(0, 4000) : '';
  const images = (Array.isArray(b.images) ? b.images : [])
    .map((u) => (typeof u === 'string' ? u.match(IMG) : null)).filter(Boolean).slice(0, 5);
  if (!caption.trim() && !images.length) return res.status(400).json({ error: 'Nothing to read' });

  const lessons = await pastLessons(caption, author);
  const content = [];
  const past = lessonText(lessons);
  if (past) content.push({ type: 'text', text: past });
  images.forEach((m, i) => {
    content.push({ type: 'text', text: i === 0 ? 'Cover:' : `Frame ${i}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  });
  content.push({ type: 'text', text: [`Creator: @${author || 'unknown'}`, `Caption:\n${caption || '(none)'}`, english ? `English translation:\n${english}` : ''].filter(Boolean).join('\n\n') });

  const client = new Anthropic();
  try {
    const params = {
      model: MODEL,
      max_tokens: 4000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    };
    const msg = FALLBACK_OK
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params);
    if (msg.stop_reason === 'refusal') return res.status(200).json({ enabled: true, places: [], examples: lessons.length, model: msg.model });
    const text = msg.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
    let places = [];
    try { places = JSON.parse(text).places ?? []; } catch { places = []; }
    places = places.filter((p) => p && p.name && CATEGORY_IDS.includes(p.category)).slice(0, 6);
    return res.status(200).json({ enabled: true, places, examples: lessons.length, model: msg.model });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ enabled: true, places: [], error: 'Busy, try again shortly.' });
    if (e instanceof Anthropic.AuthenticationError) return res.status(200).json({ enabled: false, places: [], error: 'The Anthropic API key was refused.' });
    console.error(e);
    return res.status(502).json({ enabled: true, places: [], error: 'The AI reader didn’t respond.' });
  }
}
