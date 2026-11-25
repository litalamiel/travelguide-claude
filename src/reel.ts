const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

const EN = new Set('the and of to in is it for with you this that on my we our at best was are be from your all so one day place here must just trip food view can not have love'.split(' '));

// Very common words in other languages travel captions are often written in.
const OTHER = new Set(('de het een en van op met voor niet dit deze zijn naar vanaf mooie plek ' + // Dutch
  'der die das und ist nicht mit für ein eine auf wir sehr ' + // German
  'el la los las y es muy con para una por del que en ' + // Spanish
  'o os as um uma não com para muito do da dos das em ' + // Portuguese
  'il lo gli e è molto con per una che di ' + // Italian
  'le les et est très avec pour une des du au dans nous').split(' '));
const EN_ONLY = new Set([...EN].filter((w) => !OTHER.has(w)));

/** Does any part of the caption read as another language? Mixed captions count. */
export function looksNonEnglish(text: string): boolean {
  const body = text.replace(/#[\p{L}\d_]+|@[\w.]+|https?:\S+/gu, ' ');
  if (/[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Greek}]/u.test(body)) return true;
  for (const line of body.split(/\n+/)) {
    const words = line.toLowerCase().match(/\p{L}+/gu) ?? [];
    if (words.length < 4) continue;
    const other = words.filter((w) => OTHER.has(w)).length;
    const en = words.filter((w) => EN_ONLY.has(w)).length;
    if (other >= 2 && other > en) return true;
  }
  return false;
}

const LANGS: Record<string, string> = { pt: 'Portuguese', es: 'Spanish', it: 'Italian', fr: 'French', de: 'German', he: 'Hebrew', iw: 'Hebrew', nl: 'Dutch', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', 'zh-CN': 'Chinese', ru: 'Russian', ar: 'Arabic', el: 'Greek', tr: 'Turkish', th: 'Thai', pl: 'Polish' };
export const langName = (code?: string) => (code ? LANGS[code] ?? LANGS[code.split('-')[0]] ?? code.toUpperCase() : 'another language');

export async function translateToEnglish(text: string): Promise<{ text: string; lang?: string }> {
  const r = await fetch(`${API_BASE}/api/translate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.text) throw new Error(d.error || 'Translation is unavailable right now.');
  return { text: d.text, lang: d.lang };
}

/** Take a few still frames from the reel video (spread through it), as small JPEGs. */
export async function keyFrames(src: string, count = 3, width = 720): Promise<string[]> {
  const url = src.startsWith('/') ? `${API_BASE}${src}` : src;
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  const once = (ev: string) => new Promise<void>((ok, fail) => {
    const t = setTimeout(() => fail(new Error('timeout')), 15000);
    video.addEventListener(ev, () => { clearTimeout(t); ok(); }, { once: true });
    video.addEventListener('error', () => { clearTimeout(t); fail(new Error('video')); }, { once: true });
  });
  await once('loadeddata');
  const d = video.duration || 0;
  if (!d) return [];
  const canvas = document.createElement('canvas');
  const out: string[] = [];
  for (let k = 0; k < count; k++) {
    video.currentTime = Math.min(d - 0.1, d * (0.15 + (0.7 * k) / Math.max(1, count - 1)));
    await once('seeked');
    const scale = Math.min(1, width / (video.videoWidth || width));
    canvas.width = Math.round((video.videoWidth || width) * scale);
    canvas.height = Math.round((video.videoHeight || width) * scale);
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    out.push(canvas.toDataURL('image/jpeg', 0.72));
  }
  video.removeAttribute('src'); video.load();
  return out;
}
