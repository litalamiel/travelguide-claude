import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, KIDS, categoryById } from './categories';
import { deleteClip, newClipId, saveClip, videoThumb } from './clips';
import { searchPlaces, type SearchResult } from './geocode';
import type { CategoryId, PendingPlace, Place } from './types';

export interface Clip { id: string; thumb: string; seconds: number; placeId?: string }

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const duration = (blob: Blob) => new Promise<number>((res) => {
  const u = URL.createObjectURL(blob); const v = document.createElement('video');
  v.preload = 'metadata'; v.src = u;
  v.onloadedmetadata = () => { URL.revokeObjectURL(u); res(isFinite(v.duration) ? v.duration : 0); };
  v.onerror = () => { URL.revokeObjectURL(u); res(0); };
});

/**
 * Design 2A: a creator turns a downloaded story highlight into places.
 * Clips on the left, the place being edited next to them, and the real map on the right
 * (the place shows there as a draggable preview pin).
 */
export default function HighlightImport({ mapName, onRename, places, pending, onPreview, onPending, onAddPlace, onClose, near }: {
  mapName: string; onRename: (name: string) => void; places: Place[];
  pending?: PendingPlace; onPreview: (r: SearchResult) => void; onPending: (p?: PendingPlace) => void;
  onAddPlace: (p: PendingPlace) => void; onClose: () => void; near: { lat: number; lng: number };
}) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState('');
  const [flags, setFlags] = useState<{ mustSee: boolean; kids: boolean; free: boolean }>({ mustSee: false, kids: false, free: false });
  const [confirmClose, setConfirmClose] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchPlaces(q, near)); } catch { setResults([]); }
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr('');
    const list = Array.from(files).filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(f.name));
    if (!list.length) { setErr('Those files aren’t videos. Choose the story videos you downloaded.'); return; }
    setBusy(list.length);
    for (const f of list) {
      try {
        const id = newClipId();
        const [thumb, seconds] = await Promise.all([videoThumb(f), duration(f)]);
        await saveClip(id, f);
        setClips((cs) => [...cs, { id, thumb, seconds }]);
      } catch (e) { setErr(`${f.name}: ${(e as Error).message}`); }
      setBusy((b) => b - 1);
    }
  };

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const move = (id: string, d: number) => setPicked((p) => {
    const i = p.indexOf(id); const j = i + d;
    if (i < 0 || j < 0 || j >= p.length) return p;
    const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const placeColor = (pid?: string) => { const p = places.find((x) => x.id === pid); return p ? categoryById(p.category).color : undefined; };
  const unused = clips.filter((c) => !c.placeId);
  const thumbOf = (id: string) => clips.find((c) => c.id === id)?.thumb;

  const add = () => {
    if (!pending) return;
    const ids = picked;
    const photo = ids.map(thumbOf).filter((x): x is string => !!x).slice(0, 1);
    onAddPlace({ ...pending, source: 'search', stories: ids, note: note.trim() || undefined, mustSee: flags.mustSee || undefined, kids: flags.kids || undefined, free: flags.free || undefined, photos: [...photo, ...(pending.photos ?? [])] });
    // The new place's id isn't known here; mark the clips as used by the place that now carries them.
    setClips((cs) => cs.map((c) => (ids.includes(c.id) ? { ...c, placeId: '__pending__' } : c)));
    setPicked([]); setNote(''); setQuery(''); setFlags({ mustSee: false, kids: false, free: false });
  };
  // Point clips at the place that holds them (so the dot shows that place's color).
  useEffect(() => {
    setClips((cs) => cs.map((c) => { const p = places.find((x) => x.stories?.includes(c.id)); return p ? { ...c, placeId: p.id } : c.placeId === '__pending__' ? c : { ...c, placeId: undefined }; }));
  }, [places]);

  const finish = async () => {
    await Promise.all(unused.map((c) => deleteClip(c.id).catch(() => undefined)));
    onPending(undefined);
    onClose();
  };

  const setCat = (id: CategoryId) => pending && onPending({ ...pending, category: id });

  return (
    <aside className="hl" aria-label="Import a story highlight">
      <div className="hl__head">
        <label className="hl__name"><span className="sr-only">Map name</span>
          <input value={mapName} onChange={(e) => onRename(e.target.value)} placeholder="Name this map, e.g. Lisbon 🇵🇹" />
        </label>
        {confirmClose ? (
          <span className="row hl__confirm">
            <span className="small">{unused.length} unused {unused.length === 1 ? 'clip' : 'clips'} will be removed.</span>
            <button className="btn btn--small btn--primary" onClick={finish}>Done</button>
            <button className="btn btn--small" onClick={() => setConfirmClose(false)}>Keep editing</button>
          </span>
        ) : (
          <button className="btn btn--primary" onClick={() => (unused.length ? setConfirmClose(true) : finish())}>Done</button>
        )}
      </div>
      {!clips.length && (
        <div className="hl__help">
          <strong>Instagram doesn’t let apps read your Highlights or stories.</strong> Save them first: on Instagram open the highlight, tap <b>⋯ › Download</b> (or Save video) on each story, then choose those videos here. They stay in this browser for now.
        </div>
      )}
      <div className="hl__cols">
        <section className="hl__clips" aria-label="Your clips">
          <div className="field-label">Your clips{clips.length ? ` · ${unused.length} not used yet` : ''}</div>
          <div className="hl__grid">
            {clips.map((c) => {
              const on = picked.includes(c.id);
              const color = c.placeId && c.placeId !== '__pending__' ? placeColor(c.placeId) : undefined;
              return (
                <button key={c.id} className={'hl__clip' + (on ? ' hl__clip--on' : '') + (c.placeId ? ' hl__clip--used' : '')} aria-pressed={on}
                  aria-label={`Clip ${fmt(c.seconds)}${c.placeId ? ', already in a place' : ''}`} onClick={() => toggle(c.id)}>
                  <img src={c.thumb} alt="" />
                  <span className="hl__dur">{fmt(c.seconds)}</span>
                  <span className="hl__check" style={color ? { background: color, borderColor: '#fff' } : undefined}>{on ? picked.indexOf(c.id) + 1 : ''}</span>
                </button>
              );
            })}
            <button className="hl__add" onClick={() => input.current?.click()} disabled={busy > 0}>
              <span aria-hidden="true" style={{ fontSize: 22 }}>＋</span>{busy > 0 ? `Adding ${busy}…` : clips.length ? 'Add more' : 'Choose videos'}
            </button>
          </div>
          <input ref={input} type="file" accept="video/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          {err && <p className="warn small">{err}</p>}
        </section>

        <section className="hl__place" aria-label="Place for the selected clips">
          <div className="field-label">{places.length ? `Place ${places.length + 1}` : 'First place'}</div>
          {!picked.length && <p className="muted small">Select the clips that show one place, then find it on the map.</p>}
          {picked.length > 0 && (
            <>
              <div className="search hl__search">
                <label htmlFor="hlq" className="sr-only">Where is this?</label>
                <input id="hlq" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={pending ? pending.name : 'Where is this? Search the place'} autoComplete="off" />
                {(results.length > 0 || searching) && (
                  <ul className="results" role="listbox">
                    {searching && <li className="results__hint">Searching…</li>}
                    {results.map((r, i) => (
                      <li key={i}><button className="result" onClick={() => { onPreview(r); setQuery(''); setResults([]); }}>
                        <span className="dot" style={{ background: categoryById(r.category).color }} />
                        <span className="result__text"><strong>{r.name}</strong><small>{r.address}</small></span>
                      </button></li>
                    ))}
                  </ul>
                )}
              </div>
              {pending && (
                <>
                  <div className="hl__picked"><strong>{pending.name}</strong><small>{pending.address} · drag the pin on the map if it’s off</small></div>
                  <div className="chips">
                    {CATEGORIES.map((c) => {
                      const on = c.id === pending.category;
                      return <button key={c.id} className={'chip' + (on ? ' chip--on' : '')} style={on ? { background: c.color, borderColor: c.color } : undefined} aria-pressed={on} onClick={() => setCat(c.id)}>{c.label}</button>;
                    })}
                  </div>
                  <label className="field">Your note for travelers
                    <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. go before 12, bifanas at the back counter" />
                  </label>
                  <div className="chips">
                    <button className={'chip' + (flags.mustSee ? ' chip--on chip--must' : '')} aria-pressed={flags.mustSee} onClick={() => setFlags({ ...flags, mustSee: !flags.mustSee })}>★ Must do</button>
                    <button className={'chip' + (flags.kids ? ' chip--kids-on' : '')} aria-pressed={flags.kids} onClick={() => setFlags({ ...flags, kids: !flags.kids })}><span className="kids-badge">{KIDS.text}</span> Kids friendly</button>
                    <button className={'chip' + (flags.free ? ' chip--on' : '')} aria-pressed={flags.free} onClick={() => setFlags({ ...flags, free: !flags.free })}>Free preview</button>
                  </div>
                </>
              )}
              <div className="field-label">Stories for this place · in this order</div>
              <div className="hl__order">
                {picked.map((id, j) => (
                  <div key={id} className="hl__ordered">
                    <img src={thumbOf(id)} alt={`Story ${j + 1}`} />
                    <span className="hl__arrows">
                      <button aria-label="Move earlier" onClick={() => move(id, -1)} disabled={j === 0}>‹</button>
                      <button aria-label="Move later" onClick={() => move(id, 1)} disabled={j === picked.length - 1}>›</button>
                    </span>
                  </div>
                ))}
              </div>
              <div className="row">
                <button className="btn" onClick={() => { setPicked([]); onPending(undefined); }}>Clear</button>
                <button className="btn btn--primary" disabled={!pending} onClick={add}>Add place{picked.length ? ` with ${picked.length} ${picked.length === 1 ? 'story' : 'stories'}` : ''}</button>
              </div>
            </>
          )}
          {places.length > 0 && (
            <div className="hl__done">
              <div className="field-label">On this map · {places.length}</div>
              <ul>{places.map((p) => <li key={p.id}><span className="dot" style={{ background: categoryById(p.category).color }} />{p.name}<small>{p.stories?.length ? ` · ${p.stories.length} stories` : ''}{p.free ? ' · free' : ''}</small></li>)}</ul>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
