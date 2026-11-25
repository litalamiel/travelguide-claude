import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView from './MapView';
import { CATEGORIES, categoryById } from './categories';
import { analyzeCaption, findCaptionPlace, searchPlaces, type SearchResult } from './geocode';
import { daysFromTrip, planTrip, toTripDays, type PlanOptions } from './planner';
import { loadMaps, newMap, saveMaps } from './storage';
import type { CategoryId, Listing, PendingPlace, Place, SavedTrip, TripMap } from './types';
import { Itinerary, TripsPanel } from './Trips';
import { arrangeMeals } from './timeline';
import { CaptionBlock, Carousel, ConfirmPlace, CreatorHeader, PlaceDetail } from './Place';
import { englishFor, keyFrames } from './reel';
import { MapsPanel, SellPanel, BuyerPreview } from './Maps';
import { BulkReview, CollectionImport, batchFromHash, collectionFrom, toPlaces, useBulkReader, type BulkTarget, type ReelBatch } from './Bulk';

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
  // Several categories can be on at once; none selected means show everything.
  const [cats, setCats] = useState<CategoryId[]>([]);
  const toggleCat = (id: CategoryId) => setCats((cs) => (cs.includes(id) ? cs.filter((c) => c !== id) : [...cs, id]));
  const [selectedId, setSelectedId] = useState<string>();
  const [center, setCenter] = useState({ lat: 38.71, lng: -9.16 });
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; key: number }>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [panel, setPanel] = useState<'none' | 'import' | 'plan'>('none');
  // Saved trips live on the map; the open one is turned into day plans from the current places.
  const [tripId, setTripId] = useState<string>();
  const [tripsOpen, setTripsOpen] = useState(false);
  const trips = current.trips ?? [];
  const trip = trips.find((t) => t.id === tripId);
  const plan = useMemo(() => (trip ? daysFromTrip(trip, places) : undefined), [trip, places]);
  const saveTrip = (t: SavedTrip) => setMaps((ms) => ms.map((m) => (m.id === current.id ? { ...m, trips: (m.trips ?? []).some((x) => x.id === t.id) ? (m.trips ?? []).map((x) => (x.id === t.id ? t : x)) : [...(m.trips ?? []), t] } : m)));
  const deleteTrip = (id: string) => { setMaps((ms) => ms.map((m) => (m.id === current.id ? { ...m, trips: (m.trips ?? []).filter((x) => x.id !== id) } : m))); setTripId(undefined); setActiveDay(undefined); };
  const [activeDay, setActiveDay] = useState<number>();

  useEffect(() => setStorageWarning(!saveMaps(maps)), [maps]);

  const switchMap = (id: string) => {
    setMapId(id); setTripId(undefined); setActiveDay(undefined); setSelectedId(undefined); setCats([]); setMapsOpen(false);
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

  const visible = cats.length ? places.filter((p) => cats.includes(p.category)) : places;
  const selected = places.find((p) => p.id === selectedId);
  const cardsRef = useRef<HTMLDivElement>(null);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    const p = places.find((x) => x.id === id);
    if (p) setFlyTo({ lat: p.lat, lng: p.lng, key: Date.now() });
    requestAnimationFrame(() => cardsRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }));
  }, [places]);

  // Option A: a chosen result is previewed on the map first; it's saved only on "Add to map".
  const [pending, setPending] = useState<PendingPlace>();
  const [storageWarning, setStorageWarning] = useState(false);
  const preview = (r: SearchResult, extra: Partial<PendingPlace> = {}) => {
    setPending({ name: r.name, lat: r.lat, lng: r.lng, address: r.address, category: r.category, source: 'search', photos: [], ...extra });
    setTripId(undefined); setSelectedId(undefined);
    setQuery(''); setResults([]);
    setFlyTo({ lat: r.lat, lng: r.lng, key: Date.now() });
  };
  const confirmPending = () => {
    if (!pending) return;
    const p: Place = { ...pending, id: uid() };
    setPlaces((ps) => [...ps, p]);
    setPending(undefined);
    setCats((cs) => (cs.length && !cs.includes(p.category) ? [...cs, p.category] : cs));
    setSelectedId(p.id);
  };

  // Many reels at once (a saved collection sent by the bookmark), reviewed on the map.
  const [batch, setBatch] = useState<ReelBatch>();
  const [sentElsewhere, setSentElsewhere] = useState(false);
  const [bulkFocus, setBulkFocus] = useState<string>();
  const bulkReader = useBulkReader(batch, center);
  useEffect(() => {
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('travel-maps-import') : undefined;
    // A tab that's waiting for the collection (Import reel is open) takes the reels.
    if (channel) channel.onmessage = (e) => {
      if (e.data?.type === 'batch' && (window as unknown as { __tmWaiting?: boolean }).__tmWaiting) {
        channel.postMessage({ type: 'taken', id: e.data.id });
        setPanel('none'); setPending(undefined); setTripId(undefined); setSelectedId(undefined);
        setBatch(e.data.batch);
      }
    };
    const take = () => {
      const b = batchFromHash(window.location.hash);
      if (!b) return;
      history.replaceState(null, '', window.location.pathname + window.location.search);
      if (!channel) { setBatch(b); return; }
      const id = Math.random().toString(36).slice(2);
      let taken = false;
      const listen = (e: MessageEvent) => { if (e.data?.type === 'taken' && e.data.id === id) taken = true; };
      channel.addEventListener('message', listen);
      channel.postMessage({ type: 'batch', id, batch: b });
      setTimeout(() => {
        channel.removeEventListener('message', listen);
        if (taken) { setSentElsewhere(true); window.close(); } else setBatch(b);
      }, 500);
    };
    take();
    window.addEventListener('hashchange', take);
    return () => { window.removeEventListener('hashchange', take); channel?.close(); };
  }, []);
  const bulkPins = useMemo(() => bulkReader.places.map((p) => {
    const m = p.matches[p.choice];
    return { key: p.key, lat: m.lat, lng: m.lng, category: p.category ?? m.category, sure: p.sure || p.matches.length === 1, keep: p.keep, name: m.name };
  }), [bulkReader.places]);
  // Where the reviewed places go. Starts on a map with the collection's name, or a new map named after it.
  const [bulkTarget, setBulkTarget] = useState<BulkTarget>({ newName: 'Imported reels' });
  useEffect(() => {
    if (!batch) return;
    const same = maps.find((m) => m.name.trim().toLowerCase() === batch.name.trim().toLowerCase());
    setBulkTarget(same ? { mapId: same.id } : { newName: batch.name });
    // Only when a new collection arrives, not on every map change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch]);
  const addBulk = () => {
    const add = toPlaces(bulkReader.places, bulkReader.reels, uid);
    const t = bulkTarget;
    let id: string;
    if ('newName' in t) {
      const m = newMap(t.newName, add);
      id = m.id;
      setMaps((ms) => [...ms, m]);
    } else {
      id = t.mapId;
      setMaps((ms) => ms.map((m) => (m.id === id ? { ...m, places: [...m.places, ...add] } : m)));
    }
    setMapId(id); setTripId(undefined); setActiveDay(undefined); setSelectedId(undefined);
    setBatch(undefined); setBulkFocus(undefined); setCats([]);
    if (add[0]) setFlyTo({ lat: add[0].lat, lng: add[0].lng, key: Date.now() });
  };

  const update = (id: string, patch: Partial<Place>) => setPlaces((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id: string) => { setPlaces((ps) => ps.filter((p) => p.id !== id)); setSelectedId(undefined); setTripId(undefined); };

  const mapPlaces = plan
    ? [...plan.flatMap((d) => d.places), ...plan.map((d) => d.stay).filter((h, i, a): h is Place => !!h && a.indexOf(h) === i)]
    : visible;

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
                      <button className="result" onClick={() => preview(r)}>
                        <span className="dot" style={{ background: c.color }} />
                        <span className="result__text"><strong>{r.name}</strong><small>{r.address || c.label}</small></span>
                        <span className="result__add">Show on map</span>
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
          <button className={'cat' + (!cats.length ? ' cat--on' : '')} onClick={() => setCats([])} aria-pressed={!cats.length}>
            <span className="cat__icon" style={{ background: !cats.length ? '#0f766e' : '#ccfbf1', color: !cats.length ? '#fff' : '#0f766e' }}>
              <Icon d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
            </span>
            All <span className="cat__n">{counts.all}</span>
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.id} className={'cat' + (cats.includes(c.id) ? ' cat--on' : '')} onClick={() => { toggleCat(c.id); setTripId(undefined); }} aria-pressed={cats.includes(c.id)}>
              <span className="cat__icon" style={{ background: cats.includes(c.id) ? c.color : c.tint, color: cats.includes(c.id) ? '#fff' : c.color }}><Icon d={c.icon} /></span>
              {c.label} <span className="cat__n">{counts[c.id] ?? 0}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="stage">
        <MapView places={batch ? [] : mapPlaces} selectedId={selectedId} onSelect={select} onCenterChange={setCenter} plan={plan} activeDay={activeDay} flyTo={flyTo}
          preview={pending} onPreviewMove={(lat, lng) => setPending((p) => (p ? { ...p, lat, lng } : p))}
          bulk={batch ? bulkPins : undefined} bulkFocus={bulkFocus} onBulkSelect={setBulkFocus} />
        {sentElsewhere && <div className="toast" role="status">Sent the reels to your other Travel Maps tab. You can close this one.</div>}
        {batch && (
          <BulkReview batch={batch} reels={bulkReader.reels} places={bulkReader.places} setPlaces={bulkReader.setPlaces} setReels={bulkReader.setReels}
            focus={bulkFocus}
            onFocus={(k) => { setBulkFocus(k); const p = k ? bulkPins.find((x) => x.key === k) : undefined; if (p) setFlyTo({ lat: p.lat, lng: p.lng, key: Date.now() }); }}
            maps={maps.map((m) => ({ id: m.id, name: m.name, count: m.places.length }))} target={bulkTarget} onTarget={setBulkTarget}
            onAdd={addBulk} onClose={() => { setBatch(undefined); setBulkFocus(undefined); }} />
        )}
        {storageWarning && <div className="toast" role="status">This browser is out of storage space, so recent changes may not be saved. Remove some photos to free space.</div>}
        {pending && <ConfirmPlace pending={pending} onChange={setPending} onCancel={() => setPending(undefined)} onAdd={confirmPending} />}

        {!plan && !pending && !batch && (
          <div className="fabs">
            {trips.length > 0 && <button className="fab fab--light" onClick={() => setTripsOpen(true)}>My trips ({trips.length})</button>}
            <button className="fab" onClick={() => setPanel('plan')} disabled={!places.length}>
              Plan trip from {places.length} places
            </button>
          </div>
        )}

        {!plan && !pending && !batch && visible.length > 0 && (
          <div className="cards" ref={cardsRef}>
            {visible.map((p) => {
              const c = categoryById(p.category);
              return (
                <button key={p.id} data-id={p.id} className={'card' + (p.id === selectedId ? ' card--on' : '')} onClick={() => select(p.id)}>
                  <span className="card__thumb" style={{ background: c.tint, color: c.color }}>
                    {p.photos?.length ? <img src={p.photos[0]} alt="" /> : <Icon d={c.icon} size={28} />}
                    {p.source === 'reel' && <span className="card__reel" aria-label="From a reel">▶</span>}
                  </span>
                  <span className="card__body">
                    <span className="card__name">{p.name}</span>
                    <span className="card__tags">
                      <span className="tag" style={{ background: c.tint, color: c.color }}>{c.label}</span>
                      {p.mustSee && <span className="tag tag--must">Must see</span>}
                    </span>
                    <span className="card__src">{p.source === 'reel' ? 'From a reel' : p.source === 'sample' ? 'Sample place' : 'Added by search'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {!plan && visible.length === 0 && <div className="empty">{cats.length ? `No ${cats.map((c) => categoryById(c).label.toLowerCase()).join(' or ')} places yet.` : 'No places yet.'} Search above to add one.</div>}

        {selected && !plan && !pending && (
          <PlaceDetail key={selected.id} place={selected} onUpdate={(patch) => update(selected.id, patch)} onRemove={() => remove(selected.id)} onClose={() => setSelectedId(undefined)} />
        )}

        {panel === 'plan' && !plan && (
          <PlanForm
            count={places.length}
            onCancel={() => setPanel('none')}
            onPlan={(o) => {
              const r0 = planTrip(places, o);
              const r = { ...r0, days: r0.days.map((d) => ({ ...d, places: arrangeMeals(d.places) })) };
              const t: SavedTrip = {
                id: uid(), createdAt: new Date().toISOString(), maxDriveHours: o.maxDriveHours,
                name: `Trip ${trips.length + 1} · ${o.nights} ${o.nights === 1 ? 'night' : 'nights'}`,
                days: toTripDays(r.days, places, o.nights + 1),
              };
              saveTrip(t); setTripId(t.id); setActiveDay(1); setPanel('none'); setSelectedId(undefined);
            }}
          />
        )}

        {plan && trip && (
          <Itinerary
            key={trip.id}
            trip={trip} days={plan} places={places}
            activeDay={activeDay} onActiveDay={setActiveDay}
            onChange={saveTrip}
            onClose={() => { setTripId(undefined); setActiveDay(undefined); }}
            onDelete={() => deleteTrip(trip.id)}
            onSelectPlace={select}
          />
        )}
        {tripsOpen && (
          <TripsPanel
            trips={trips}
            onOpen={(id) => { setTripId(id); setActiveDay(1); setTripsOpen(false); setSelectedId(undefined); }}
            onNew={() => { setTripsOpen(false); setPanel('plan'); }}
            onClose={() => setTripsOpen(false)}
          />
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
            onAdd={(r, url, reel, photos, note, later) => {
              setPanel('none');
              preview(r, { source: 'reel', reelUrl: url, reel, photos, note: note || undefined });
              // Key frames keep arriving after the pin is shown: add them to the card if it's still open.
              later?.then((f) => f.length && setPending((p) => (p && p.reelUrl === url ? { ...p, photos: [...(p.photos ?? []), ...f.filter((x) => !p.photos?.includes(x))].slice(0, 10) } : p))).catch(() => {});
            }}
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

type ReelInfo = NonNullable<Place['reel']>;

function ImportReel({ near, onClose, onAdd }: { near: { lat: number; lng: number }; onClose: () => void; onAdd: (r: SearchResult, url: string, reel: ReelInfo, photos: string[], note: string, later?: Promise<string[]>) => void }) {
  const [url, setUrl] = useState('');
  const [reel, setReel] = useState<ReelInfo>({});
  const [images, setImages] = useState<string[]>([]);
  const [frames, setFrames] = useState<string[]>([]);
  const [framesState, setFramesState] = useState<'none' | 'loading' | 'done' | 'failed'>('none');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'reading' | 'read' | 'failed'>('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ phrase: string; matches: SearchResult[] }[]>();
  const [added, setAdded] = useState<Set<string>>(new Set());
  const caption = reel.caption ?? '';
  const collection = collectionFrom(url);
  // While a collection link is showing, this tab takes the reels the bookmark sends back.
  useEffect(() => {
    const w = window as unknown as { __tmWaiting?: boolean };
    w.__tmWaiting = !!collection;
    return () => { w.__tmWaiting = false; };
  }, [!!collection]);

  const framesRef = useRef<Promise<string[]>>();
  const infoRef = useRef<{ reel: ReelInfo; images: string[]; note: string }>({ reel: {}, images: [], note: '' });
  infoRef.current = { reel, images, note };

  const findPlaces = async (text: string, auto = false) => {
    setBusy(true);
    const out = [];
    const how: { sure: boolean; weak: boolean }[] = [];
    const english = await englishFor(text);
    for (const p of analyzeCaption(text, english)) {
      const phrase = p.from === 'pin' ? `📍 ${p.query}${p.area ? `, ${p.area}` : ''}` : p.query;
      // One confident match (right kind of place) is shown alone; otherwise the top 3.
      try {
        const f = await findCaptionPlace(p, near);
        how.push({ sure: f.confident, weak: p.from === 'name' || p.from === 'hashtag' });
        out.push({ phrase, matches: f.results.slice(0, f.confident ? 1 : 3) });
      } catch { how.push({ sure: false, weak: true }); out.push({ phrase, matches: [] }); }
    }
    // The reel is about one place and we're sure which: put it on the map right away (with its key frames).
    // With a pin or "at X": that one place, if it's the only one. With only loose guesses (names in a caption
    // written in another script): the first one that matched clearly; the caption names its subject first.
    const strong = out.filter((_, i) => !how[i].weak);
    const sureOne = strong.length
      ? (strong.length === 1 && how[out.indexOf(strong[0])].sure ? strong[0] : undefined)
      : out.find((_, i) => how[i].sure);
    if (auto && sureOne) {
      // Show the pin right away; the key frames join the card as soon as they're ready.
      const info = infoRef.current;
      setBusy(false);
      onAdd(sureOne.matches[0], url.trim(), info.reel, info.images.slice(0, 10), info.note, framesRef.current);
      return;
    }
    setFound(out);
    setBusy(false);
  };

  // Read the reel automatically as soon as a link is pasted: caption, creator, cover, key frames.
  useEffect(() => {
    const link = url.trim();
    setFound(undefined); setFrames([]); setFramesState('none');
    if (!isReelLink(link)) { setStatus('idle'); setError(''); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setStatus('reading'); setError('');
      try {
        const r = await fetch(`${API_BASE}/api/reel?url=${encodeURIComponent(link)}`);
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || !data.caption) throw new Error(data.error || 'Couldn’t read this reel automatically.');
        setReel({ caption: data.caption, author: data.author, authorName: data.authorName, avatar: data.avatar });
        setImages(Array.isArray(data.images) ? data.images : []);
        setStatus('read');
        framesRef.current = undefined;
        if (data.video) {
          setFramesState('loading');
          framesRef.current = keyFrames(data.video, 8);
          framesRef.current.then((f) => { if (!cancelled) { setFrames(f); setFramesState(f.length ? 'done' : 'failed'); } })
            .catch(() => { if (!cancelled) setFramesState('failed'); });
        }
        infoRef.current = { reel: { caption: data.caption, author: data.author, authorName: data.authorName, avatar: data.avatar }, images: Array.isArray(data.images) ? data.images : [], note: '' };
        findPlaces(data.caption, true);
      } catch (e) {
        if (cancelled) return;
        setStatus('failed');
        setError(e instanceof Error && !/Unexpected|JSON|fetch/i.test(e.message) ? e.message : 'Couldn’t read this reel automatically.');
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const gallery = [...images, ...frames];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Import from Instagram" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2>Import from an Instagram reel</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon d="M6 6l12 12M18 6L6 18" /></button>
        </div>
        <label className="field">Paste a reel link, or a saved collection link on a computer
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…" autoFocus />
        </label>
        {collection && <CollectionImport link={collection} />}
        {url.trim() && !collection && !isReelLink(url.trim()) && <p className="warn small">That doesn’t look like an Instagram reel or saved-collection link.</p>}
        {status === 'reading' && <p className="muted small">Reading the reel…</p>}
        {status === 'read' && (
          <div className="caption-box">
            <CreatorHeader reel={reel} reelUrl={url.trim()} />
            {gallery.length > 0 && <Carousel photos={gallery} alt="Reel" />}
            {framesState === 'loading' && <p className="muted small">Taking key frames from the video…</p>}
            {framesState === 'failed' && <p className="muted small">Couldn’t take frames from this video, so only the cover is shown.</p>}
            <CaptionBlock reel={reel} onSave={(patch) => { const next = { ...reel, ...patch }; setReel(next); findPlaces(`${next.caption ?? ''}\n${next.captionOriginal ?? ''}`); }} />
          </div>
        )}
        {status === 'failed' && (
          <>
            <p className="warn small">{error} You can paste the caption below instead.</p>
            <label className="field">Caption
              <textarea rows={4} value={caption} onChange={(e) => setReel({ ...reel, caption: e.target.value })} placeholder="📍 Pastéis de Belém — best custard tarts in Lisbon…" />
            </label>
            <button className="btn btn--primary" onClick={() => findPlaces(caption)} disabled={busy || caption.trim().length < 3}>{busy ? 'Finding places…' : 'Find places'}</button>
          </>
        )}
        {(status === 'read' || status === 'failed') && (
          <label className="field">My notes about this reel
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. order the octopus, go before sunset" />
          </label>
        )}
        {busy && status === 'read' && <p className="muted small">Finding places on the map…</p>}
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
                      <span className="result__text"><strong>{m.name}</strong><small>{categoryById(m.category).label} · {m.address}</small></span>
                      <button className="btn btn--small" disabled={added.has(key)} onClick={() => { setAdded(new Set(added).add(key)); onAdd(m, url.trim(), reel, gallery.slice(0, 10), note); }}>Show on map</button>
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
