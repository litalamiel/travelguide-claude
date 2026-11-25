// Self-learning reel place detection, the app side.
// 1. Shared memory: a reel someone already confirmed is answered from /api/learn right away.
// 2. Claude reads the caption and pictures (/api/ai-place), seeing similar past fixes first.
// 3. Every confirm, fix or "Not this one" is sent back as a lesson.
// All of it switches off quietly when the server has no Supabase / Anthropic keys.
import { findCaptionPlace, type SearchResult } from './geocode';
import type { CategoryId, PendingPlace } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
const APP_VERSION = 'learn-1';

export type GuessMethod = 'memory' | 'ai' | 'rules' | 'none';

export interface AiPlace { name: string; area: string; country: string; category: CategoryId; confidence: 'high' | 'medium' | 'low'; evidence: string }

/** What the app guessed for one reel, kept until the user confirms, fixes or turns it down. */
export interface LessonDraft {
  shortcode: string;
  author?: string;
  caption?: string;
  captionEn?: string;
  cover?: string;
  method: GuessMethod;
  guess?: SearchResult;
  ai?: { places: AiPlace[]; model?: string; examples?: number };
  flow?: 'single' | 'bulk';
}

let status: Promise<{ memory: boolean; ai: boolean }> | undefined;
/** Which learning parts the server has switched on (asked once per visit). */
export function learnStatus() {
  status ??= fetch(`${API_BASE}/api/learn?action=status`).then((r) => (r.ok ? r.json() : { memory: false, ai: false }))
    .then((d) => ({ memory: !!d.memory, ai: !!d.ai })).catch(() => ({ memory: false, ai: false }));
  return status;
}

function clientId(): string {
  try {
    let id = localStorage.getItem('travelmaps.client');
    if (!id) { id = Math.random().toString(36).slice(2, 12); localStorage.setItem('travelmaps.client', id); }
    return id;
  } catch { return 'anon'; }
}

export const shortcodeOf = (url: string) => (url.match(/instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([\w-]{5,})/i) ?? [])[1];

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p, new Promise<T>((ok) => setTimeout(() => ok(fallback), ms))]);

/** Places people already confirmed for this reel, most-confirmed first. */
export async function recall(code: string): Promise<SearchResult[]> {
  if (!(await learnStatus()).memory) return [];
  try {
    const r = await fetch(`${API_BASE}/api/learn?action=recall&code=${encodeURIComponent(code)}`);
    const d = await r.json();
    return (d.answers ?? []).map((a: { name: string; lat: number; lng: number; category: CategoryId; address?: string }) => ({ name: a.name, lat: a.lat, lng: a.lng, category: a.category, address: a.address ?? '' }));
  } catch { return []; }
}

/** Shrink a picture so a few of them fit in one request to the AI reader. */
export async function shrink(dataUrl: string, max = 768, quality = 0.75): Promise<string | undefined> {
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } catch { return undefined; }
}

/** Claude's reading of the reel. Empty when the AI reader is off, slow or unsure. */
export async function aiRead(input: { code: string; caption: string; captionEn?: string; author?: string; images: string[] }, timeoutMs = 20000): Promise<{ places: AiPlace[]; model?: string; examples?: number } | undefined> {
  if (!(await learnStatus()).ai) return undefined;
  const run = async () => {
    const images = (await Promise.all(input.images.slice(0, 5).map((u) => shrink(u)))).filter((x): x is string => !!x);
    const r = await fetch(`${API_BASE}/api/ai-place`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shortcode: input.code, caption: input.caption, captionEn: input.captionEn, author: input.author, images }),
    });
    if (!r.ok) return undefined;
    const d = await r.json();
    return d.enabled ? { places: (d.places ?? []) as AiPlace[], model: d.model as string | undefined, examples: d.examples as number | undefined } : undefined;
  };
  return withTimeout(run().catch(() => undefined), timeoutMs, undefined);
}

/** Find the AI's place on the map. Its category wins over the map's, because it read the reel. */
export async function locateAi(p: AiPlace, near?: { lat: number; lng: number }, search: <T>(fn: () => Promise<T>) => Promise<T> = (fn) => fn()): Promise<{ results: SearchResult[]; confident: boolean }> {
  const area = [p.area, p.country].filter(Boolean).join(', ');
  const f = await search(() => findCaptionPlace({ query: p.name, area: area || undefined, hint: p.category, from: 'pin' }, near));
  return { results: f.results.map((r) => ({ ...r, category: p.category })), confident: f.confident };
}

export interface SmartGuess { method: 'memory' | 'ai'; results: SearchResult[]; sure: boolean; ai?: LessonDraft['ai'] }

/**
 * The learned guess for a reel, before the app's own caption rules:
 * the shared memory first, then Claude. Undefined when neither knows.
 */
export async function smartGuess(input: { code: string; caption: string; captionEn?: string; author?: string; images: string[] }, near?: { lat: number; lng: number }, search?: <T>(fn: () => Promise<T>) => Promise<T>): Promise<SmartGuess | undefined> {
  const known = await recall(input.code);
  if (known.length) return { method: 'memory', results: known, sure: true };
  const ai = await aiRead(input);
  const top = ai?.places[0];
  if (!ai || !top || top.confidence === 'low') return ai ? { method: 'ai', results: [], sure: false, ai } : undefined;
  try {
    const f = await locateAi(top, near, search);
    if (!f.results.length) return { method: 'ai', results: [], sure: false, ai };
    return { method: 'ai', results: f.results.slice(0, f.confident ? 1 : 3), sure: top.confidence === 'high' && f.confident, ai };
  } catch { return { method: 'ai', results: [], sure: false, ai }; }
}

const placeOf = (p?: { name: string; lat: number; lng: number; category: CategoryId; address?: string; osm?: string; cc?: string }) =>
  p ? { name: p.name, lat: p.lat, lng: p.lng, category: p.category, address: p.address, osm: p.osm, cc: p.cc } : undefined;

/** Send one lesson: what the app guessed and what the user kept (nothing = turned down). Never blocks the app. */
export async function teach(draft: LessonDraft, final?: Pick<PendingPlace, 'name' | 'lat' | 'lng' | 'category' | 'address'>) {
  if (!(await learnStatus()).memory) return;
  const thumb = draft.cover ? await shrink(draft.cover, 256, 0.7) : undefined;
  const body = JSON.stringify({
    shortcode: draft.shortcode, author: draft.author, caption: draft.caption, captionEn: draft.captionEn,
    thumb, flow: draft.flow ?? 'single', method: draft.method,
    guess: placeOf(draft.guess), final: placeOf(final as SearchResult | undefined), ai: draft.ai,
    clientId: clientId(), appVersion: APP_VERSION,
  });
  fetch(`${API_BASE}/api/learn?action=log`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: draft.flow !== 'bulk' && body.length < 60000 }).catch(() => {});
}
