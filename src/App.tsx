import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView, { DAY_COLORS } from './MapView';
import { CATEGORIES, categoryById } from './categories';
import { candidatesFromCaption, searchPlaces, type SearchResult } from './geocode';
import { fmtMinutes, planTrip, type PlanOptions } from './planner';
import { loadMaps, newMap, saveMaps } from './storage';
import type { CategoryId, DayPlan, Listing, Place, TripMap } from './types';
import { MapsPanel, SellPanel, BuyerPreview } from './Maps';

const uid = () => Math.random().toString(36).slice(2, 10);

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function App() {
  const [maps, setMaps] = useState<TripMap[]>(loadMaps);
  const [mapId, setMapId] = useState<string>(() => maps[0].id);
  const current = maps.find((m) => m.id === mapId) ?? maps[0];
  const places = current.places;
  const setPlaces = useCallback((fn: (ps: Place[]) => Place[]) => {
    setMaps((ms) => ms.map((m) => (m.id === current.id ? { ...m, places: fn(m.places) } : m)));
  }, [current.id]);
  const [mapsOpen, setMapsOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [buyerOpen, setBuyerOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | CategoryId>('all');
  const [selectedId, setSelectedId] = useState<string>();
  const [center, setCenter] = useState({ lat: 38.71, lng: -9.16 });
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; key: number }>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [panel, setPanel] = useState<'none' | 'import' | 'plan'>('none');
  const [plan, setPlan] = useState<DayPlan[]>();
  const [dropped, setDropped] = useState<Place[]>([]);
  const [activeDay, setActiveDay] = useState<number>();

  useEffect(() => saveMaps(maps), [maps]);

  const switchMap = (id: string) => {
    setMapId(id); setPlan(undefined); setActiveDay(undefined); setSelectedId(undefined); setFilter('all'); setMapsOpen(false);
    const m = maps.find((x) => x.id === id);
    if (m?.places.length) {
      const lat = m.places.reduce((s, p) => s + p.lat, 0) / m.places.length;
      const lng = m.places.reduce((s, p) => s + p.lng, 0) / m.places.length;
      setFlyTo({ lat, lng, key: Date.now() });
    }
  };
  const createMap = (name: string) => { const m = newMap(name); setMaps((ms) => [...ms, m]); switchMap(m.id); };
  const renameMap = (id: string, name: string) => setMaps((ms) => ms.map((m) => (m.id === id ? { ...m, name } : m)));
  const deleteMap = (id: string) => {
    const rest = maps.filter((m) => m.id !== id);
    const next = rest.length ? rest : [newMap('My map')];
    setMaps(next);
    if (id === current.id) switchMap(next[0].id);
  };
  const saveListing = (l: Listing) => setMaps((ms) => ms.map((m) => (m.id === current.id ? { ...m, listing: l } : m)));

  // Debounced place search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || /instagram\.com/.test(q)) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true); setSearchError('');
      try { setResults(await searchPlaces(q, center)); } catch { setSearchError('Search is unavailable right now.'); }
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: places.length };
    places.forEach((p) => { c[p.category] = (c[p.category] ?? 0) + 1; });
    return c;
  }, [places]);

  const visible = filter === 'all' ? places : places.filter((p) => p.category === filter);
  const selected = places.find((p) => p.id === selectedId);
  const cardsRef = useRef<HTMLDivElement>(null);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    const p = places.find((x) => x.id === id);
    if (p) setFlyTo({ lat: p.lat, lng: p.lng, key: Date.now() });
    requestAnimationFrame(() => cardsRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }));
  }, [places]);

  const addPlace = (r: SearchResult, source: Place['source'] = 'search', reelUrl?: string) => {
    const p: Place = { id: uid(), name: r.name, lat: r.lat, lng: r.lng, address: r.address, category: r.category, source, reelUrl };
    setPlaces((ps) => [...ps, p]);
    setPlan(undefined);
    setQuery(''); setResults([]);
    setSelectedId(p.id);
    setFlyTo({ lat: p.lat, lng: p.lng, key: Date.now() });
  };

  const update = (id: string, patch: Partial<Place>) => setPlaces((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id: string) => { setPlaces((ps) => ps.filter((p) => p.id !== id)); setSelectedId(undefined); setPlan(undefined); };

  const mapPlaces = plan ? plan.flatMap((d) => d.places) : visible;

  return (
    <div className="app">
      <header className="top">
        <div className="top__row">
          <div className="brand">Travel Maps</div>
          <button className="btn map-switch" onClick={() => setMapsOpen(true)} aria-haspopup="dialog">
            <span className="map-switch__name">{current.name}</span> <span aria-hidden="true">▾</span>
          </button>
          <div className="search">
            <label htmlFor="q" className="sr-only">Search a place</label>
            <input
              id="q" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a place to add…" autoComplete="off"
            />
            {(results.length > 0 || searching || searchError) && (
              <ul className="results" role="listbox" aria-label="Search results">
                {searching && <li className="results__hint">Searching…</li>}
                {searchError && <li className="results__hint">{searchError}</li>}
                {results.map((r, i) => {
                  const c = categoryById(r.category);
                  return (
                    <li key={i}>
                      <button className="result" onClick={() => addPlace(r)}>
                        <span className="dot" style={{ background: c.color }} />
                        <span className="result__text"><strong>{r.name}</strong><small>{r.address || c.label}</small></span>
                        <span className="result__add">Add as {c.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <button className="btn btn--ghost" onClick={() => setPanel('import')}>
            <Icon d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM10 9l5 3-5 3z" /> <span className="hide-sm">Import reel</span>
          </button>
        </div>
        <nav className="cats" aria-label="Categories">
          <button className={'cat' + (filter === 'all' ? ' cat--on' : '')} onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>
            <span className="cat__icon" style={{ background: filter === 'all' ? '#0f766e' : '#ccfbf1', color: filter === 'all' ? '#fff' : '#0f766e' }}>
              <Icon d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
            </span>
            All <span className="cat__n">{counts.all}</span>
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.id} className={'cat' + (filter === c.id ? ' cat--on' : '')} onClick={() => { setFilter(c.id); setPlan(undefined); }} aria-pressed={filter === c.id}>
              <span className="cat__icon" style={{ background: filter === c.id ? c.color : c.tint, color: filter === c.id ? '#fff' : c.color }}><Icon d={c.icon} /></span>
              {c.label} <span className="cat__n">{counts[c.id] ?? 0}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="stage">
        <MapView places={mapPlaces} selectedId={selectedId} onSelect={select} onCenterChange={setCenter} plan={plan} activeDay={activeDay} flyTo={flyTo} />

        {!plan && (
          <button className="fab" onClick={() => setPanel('plan')} disabled={!places.length}>
            Plan trip from {places.length} places
          </button>
        )}

        {!plan && visible.length > 0 && (
          <div className="cards" ref={cardsRef}>
            {visible.map((p) => {
              const c = categoryById(p.category);
              return (
                <button key={p.id} data-id={p.id} className={'card' + (p.id === selectedId ? ' card--on' : '')} onClick={() => select(p.id)}>
                  <span className="card__thumb" style={{ background: c.tint, color: c.color }}><Icon d={c.icon} size={28} /></span>
                  <span className="card__body">
                    <span className="card__cat" style={{ color: c.color }}>{c.label}{p.mustSee ? ' · Must see' : ''}</span>
                    <span className="card__name">{p.name}</span>
                    <span className="card__src">{p.source === 'reel' ? 'From a reel' : p.source === 'sample' ? 'Sample place' : 'Added by search'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {!plan && visible.length === 0 && <div className="empty">No {filter === 'all' ? '' : categoryById(filter as CategoryId).label.toLowerCase() + ' '}places yet. Search above to add one.</div>}

        {selected && !plan && (
          <aside className="detail" aria-label={`${selected.name} details`}>
            <button className="icon-btn detail__close" aria-label="Close" onClick={() => setSelectedId(undefined)}><Icon d="M6 6l12 12M18 6L6 18" /></button>
            <div className="detail__cat" style={{ color: categoryById(selected.category).color }}>{categoryById(selected.category).label}</div>
            <h2>{selected.name}</h2>
            {selected.address && <p className="muted">{selected.address}</p>}
            <label className="field">Category
              <select value={selected.category} onChange={(e) => update(selected.id, { category: e.target.value as CategoryId })}>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={!!selected.mustSee} onChange={(e) => update(selected.id, { mustSee: e.target.checked })} /> Must see</label>
            <label className="field">Your note
              <input value={selected.note ?? ''} onChange={(e) => update(selected.id, { note: e.target.value })} placeholder="e.g. go early, book ahead" />
            </label>
            {selected.reelUrl && <a href={selected.reelUrl} target="_blank" rel="noreferrer">Watch the reel</a>}
            <div className="row">
              <a className="btn btn--ghost" href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`} target="_blank" rel="noreferrer">Directions</a>
              <button className="btn btn--danger" onClick={() => remove(selected.id)}>Remove</button>
            </div>
          </aside>
        )}

        {panel === 'plan' && !plan && (
          <PlanForm
            count={places.length}
            onCancel={() => setPanel('none')}
            onPlan={(o) => {
              const r = planTrip(places, o);
              setPlan(r.days); setDropped(r.dropped); setActiveDay(undefined); setPanel('none'); setSelectedId(undefined);
            }}
          />
        )}

        {plan && (
          <aside className="itin" aria-label="Itinerary">
            <div className="itin__head">
              <h2>Your trip · {plan.length} days</h2>
              <button className="btn btn--ghost" onClick={() => { setPlan(undefined); setActiveDay(undefined); }}>Back to map</button>
            </div>
            <p className="muted small">Drive times are rough estimates from straight-line distance. Live routing comes with Google Maps.</p>
            <div className="days">
              <button className={'day-tab' + (!activeDay ? ' day-tab--on' : '')} onClick={() => setActiveDay(undefined)}>All</button>
              {plan.map((d, i) => (
                <button key={d.day} className={'day-tab' + (activeDay === d.day ? ' day-tab--on' : '')} style={activeDay === d.day ? { background: DAY_COLORS[i % DAY_COLORS.length] } : undefined} onClick={() => setActiveDay(d.day)}>Day {d.day}</button>
              ))}
            </div>
            <ol className="itin__list">
              {plan.filter((d) => !activeDay || d.day === activeDay).map((d) => (
                <li key={d.day} className="itin__day">
                  <div className="itin__dayhead">
                    <span className="swatch" style={{ background: DAY_COLORS[(d.day - 1) % DAY_COLORS.length] }} />
                    <strong>Day {d.day}</strong>
                    <span className={d.overLimit ? 'warn' : 'muted'}>{fmtMinutes(d.driveMinutes)}{d.overLimit ? ' · over your limit' : ''}</span>
                  </div>
                  <ol className="stops">
                    {d.places.map((p) => (
                      <li key={p.id}><span>{p.name}</span><small style={{ color: categoryById(p.category).color }}>{categoryById(p.category).label}{p.mustSee ? ' · Must see' : ''}</small></li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
            {dropped.length > 0 && <p className="muted small">Didn't fit: {dropped.map((p) => p.name).join(', ')}. Add a night or pick a faster pace.</p>}
          </aside>
        )}

        {mapsOpen && (
          <MapsPanel
            maps={maps} currentId={current.id}
            onSwitch={switchMap} onCreate={createMap} onRename={renameMap} onDelete={deleteMap}
            onSell={() => { setMapsOpen(false); setSellOpen(true); }}
            onClose={() => setMapsOpen(false)}
          />
        )}
        {sellOpen && (
          <SellPanel
            map={current}
            onSave={(l) => { saveListing(l); }}
            onPreview={() => { setSellOpen(false); setBuyerOpen(true); }}
            onClose={() => setSellOpen(false)}
          />
        )}
        {buyerOpen && <BuyerPreview map={current} onClose={() => setBuyerOpen(false)} onEdit={() => { setBuyerOpen(false); setSellOpen(true); }} />}

        {panel === 'import' && (
          <ImportReel
            near={center}
            onClose={() => setPanel('none')}
            onAdd={(r, url) => addPlace(r, 'reel', url)}
          />
        )}
      </main>
    </div>
  );
}

function PlanForm({ count, onPlan, onCancel }: { count: number; onPlan: (o: PlanOptions) => void; onCancel: () => void }) {
  const [nights, setNights] = useState(3);
  const [drive, setDrive] = useState(2);
  const [pace, setPace] = useState<PlanOptions['pace']>('balanced');
  const [onlyMustSee, setOnlyMustSee] = useState(false);
  return (
    <div className="sheet" role="dialog" aria-label="Plan a trip">
      <h2>Plan a trip from {count} places</h2>
      <div className="grid2">
        <label className="field">Nights
          <input type="number" min={0} max={30} value={nights} onChange={(e) => setNights(Math.max(0, Number(e.target.value)))} />
        </label>
        <label className="field">Max driving a day: {drive} h
          <input type="range" min={0.5} max={6} step={0.5} value={drive} onChange={(e) => setDrive(Number(e.target.value))} />
        </label>
      </div>
      <fieldset className="pace">
        <legend>Pace</legend>
        {(['relaxed', 'balanced', 'packed'] as const).map((p) => (
          <label key={p} className={'pill' + (pace === p ? ' pill--on' : '')}>
            <input type="radio" name="pace" value={p} checked={pace === p} onChange={() => setPace(p)} /> {p[0].toUpperCase() + p.slice(1)}
          </label>
        ))}
      </fieldset>
      <label className="check"><input type="checkbox" checked={onlyMustSee} onChange={(e) => setOnlyMustSee(e.target.checked)} /> Only must-see places</label>
      <div className="row">
        <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn--primary" onClick={() => onPlan({ nights, maxDriveHours: drive, pace, onlyMustSee })}>Build itinerary</button>
      </div>
    </div>
  );
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
const isReelLink = (u: string) => /instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/[\w-]{5,}/i.test(u);

function ImportReel({ near, onClose, onAdd }: { near: { lat: number; lng: number }; onClose: () => void; onAdd: (r: SearchResult, url: string) => void }) {
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<'idle' | 'reading' | 'read' | 'failed'>('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ phrase: string; matches: SearchResult[] }[]>();
  const [added, setAdded] = useState<Set<string>>(new Set());

  const findPlaces = async (text: string) => {
    setBusy(true);
    const out = [];
    for (const phrase of candidatesFromCaption(text)) {
      try { out.push({ phrase, matches: (await searchPlaces(phrase, near)).slice(0, 3) }); } catch { out.push({ phrase, matches: [] }); }
    }
    setFound(out);
    setBusy(false);
  };

  // Read the caption automatically as soon as a reel link is pasted.
  useEffect(() => {
    const link = url.trim();
    setFound(undefined);
    if (!isReelLink(link)) { setStatus('idle'); setError(''); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setStatus('reading'); setError('');
      try {
        const r = await fetch(`${API_BASE}/api/reel?url=${encodeURIComponent(link)}`);
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || !data.caption) throw new Error(data.error || 'Couldn’t read this reel automatically.');
        setCaption(data.caption); setAuthor(data.author ?? ''); setStatus('read');
        findPlaces(data.caption);
      } catch (e) {
        if (cancelled) return;
        setStatus('failed');
        setError(e instanceof Error && !/Unexpected|JSON|fetch/i.test(e.message) ? e.message : 'Couldn’t read this reel automatically.');
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Import from Instagram" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2>Import from an Instagram reel</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon d="M6 6l12 12M18 6L6 18" /></button>
        </div>
        <label className="field">Paste a reel link
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…" autoFocus />
        </label>
        {url.trim() && !isReelLink(url.trim()) && <p className="warn small">That doesn’t look like an Instagram reel link.</p>}
        {status === 'reading' && <p className="muted small">Reading the reel’s caption…</p>}
        {status === 'read' && (
          <div className="caption-box">
            <div className="small"><strong>Caption{author ? ` by @${author}` : ''}</strong></div>
            <p className="caption-text">{caption}</p>
          </div>
        )}
        {status === 'failed' && (
          <>
            <p className="warn small">{error} You can paste the caption below instead.</p>
            <label className="field">Caption
              <textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="📍 Pastéis de Belém — best custard tarts in Lisbon…" />
            </label>
            <button className="btn btn--primary" onClick={() => findPlaces(caption)} disabled={busy || caption.trim().length < 3}>{busy ? 'Finding places…' : 'Find places'}</button>
          </>
        )}
        {busy && status === 'read' && <p className="muted small">Finding places on the map…</p>}
        <p className="muted small">The app reads the caption by itself. Listening to the voiceover and checking the video frames come next.</p>
        {found && (
          <div className="found">
            {found.length === 0 && <p className="muted">No place names found in the caption.</p>}
            {found.map((f) => (
              <div key={f.phrase} className="found__item">
                <div className="muted small">Found “{f.phrase}”</div>
                {f.matches.length === 0 && <div className="muted small">No match on the map.</div>}
                {f.matches.map((m, i) => {
                  const key = `${m.lat},${m.lng}`;
                  return (
                    <div key={i} className="found__match">
                      <span className="dot" style={{ background: categoryById(m.category).color }} />
                      <span className="result__text"><strong>{m.name}</strong><small>{m.address}</small></span>
                      <button className="btn btn--small" disabled={added.has(key)} onClick={() => { onAdd(m, url); setAdded(new Set(added).add(key)); }}>{added.has(key) ? 'Added' : 'Add'}</button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
