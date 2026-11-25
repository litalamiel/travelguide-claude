import { useEffect, useState } from 'react';
import { km } from './planner';
import type { Place } from './types';

/** A one-or-two sentence "what is this place" for itinerary slots. */
const KEY = 'travelmaps.summaries.v1';
let cache: Record<string, string> = {};
try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* storage unavailable */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* full */ } };
const pending = new Map<string, Promise<string>>();

const sentences = (t: string, n = 2) => {
  const clean = t.replace(/\s+/g, ' ').replace(/#[\p{L}\d_]+/gu, '').trim();
  const parts = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  const out = parts.slice(0, n).join(' ').trim();
  return out.length > 220 ? out.slice(0, 217).trimEnd() + '…' : out;
};

/** Text we already have: the reel caption (minus hashtags), else the address. */
export function localSummary(p: Place): string {
  const cap = p.reel?.caption?.trim();
  if (cap) return sentences(cap.replace(/📍[^\n]*/gu, ''));
  return '';
}

const words = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/** Wikipedia article near the place whose title shares a distinctive word with the place name. */
async function fromWikipedia(p: Place): Promise<string> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord=${p.lat}%7C${p.lng}&ggsradius=3000&ggslimit=20&prop=extracts|coordinates&exintro=1&explaintext=1&exsentences=2&exlimit=20&colimit=20`;
  const r = await fetch(url);
  if (!r.ok) return '';
  const j = await r.json();
  const pages = Object.values(j?.query?.pages ?? {}) as { title: string; extract?: string; coordinates?: { lat: number; lon: number }[] }[];
  const name = new Set(words(p.name));
  let best: { s: number; text: string } | undefined;
  for (const pg of pages) {
    const tw = words(pg.title);
    const shared = tw.filter((w) => name.has(w)).length;
    // Same place only: every word of the article title is in the place name, or every word of the name is in the title.
    // ("Belém Tower" must not describe "Pastéis de Belém" just because both say Belém.)
    if (!shared || !pg.extract || (shared < tw.length && shared < name.size)) continue;
    const c = pg.coordinates?.[0];
    const d = c ? km(p, { lat: c.lat, lng: c.lon }) : 3;
    const s = shared / Math.max(tw.length, 1) - d / 10;
    if (!best || s > best.s) best = { s, text: pg.extract };
  }
  return best ? sentences(best.text) : '';
}

export function useSummary(p: Place): string {
  const local = localSummary(p);
  const [text, setText] = useState(() => cache[p.id] ?? '');
  useEffect(() => {
    if (cache[p.id] !== undefined || p.category === 'stay') return;
    let alive = true;
    const job = pending.get(p.id) ?? fromWikipedia(p).catch(() => null);
    pending.set(p.id, job as Promise<string>);
    job.then((t) => { if (t === null) return; cache[p.id] = t; save(); if (alive) setText(t); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);
  return text || local;
}
