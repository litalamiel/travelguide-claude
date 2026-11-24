import { useState } from 'react';
import { categoryById } from './categories';
import { DAY_COLORS } from './MapView';
import { fmtMinutes } from './planner';
import type { DayKind, DayPlan, Place, SavedTrip, TripDay } from './types';

const KINDS: { id: DayKind; label: string }[] = [
  { id: 'regular', label: 'Sightseeing' },
  { id: 'transition', label: 'Transition' },
  { id: 'flight', label: 'Flight' },
];

function Svg({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
}

/** Saved trip: every day can be edited and has a night (hotel) or a transition / flight label. */
export function Itinerary({ trip, days, places, activeDay, onActiveDay, onChange, onClose, onDelete, onSelectPlace }: {
  trip: SavedTrip; days: DayPlan[]; places: Place[];
  activeDay?: number; onActiveDay: (d?: number) => void;
  onChange: (t: SavedTrip) => void; onClose: () => void; onDelete: () => void;
  onSelectPlace: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(trip.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const edit = (fn: (ds: TripDay[]) => TripDay[]) => onChange({ ...trip, days: fn(trip.days.map((d) => ({ ...d, placeIds: [...d.placeIds] }))) });
  const setDay = (i: number, patch: Partial<TripDay>) => edit((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const move = (i: number, from: number, to: number) => edit((ds) => {
    const ids = ds[i].placeIds; const [x] = ids.splice(from, 1); ids.splice(to, 0, x); return ds;
  });
  const moveToDay = (i: number, id: string, target: number) => edit((ds) => {
    ds[i].placeIds = ds[i].placeIds.filter((x) => x !== id); ds[target].placeIds.push(id); return ds;
  });
  const removeStop = (i: number, id: string) => edit((ds) => { ds[i].placeIds = ds[i].placeIds.filter((x) => x !== id); return ds; });
  const addStop = (i: number, id: string) => edit((ds) => { ds[i].placeIds.push(id); return ds; });
  const addDay = () => { edit((ds) => [...ds, { placeIds: [], kind: 'regular' }]); onActiveDay(trip.days.length + 1); };
  const deleteDay = (i: number) => { edit((ds) => ds.filter((_, j) => j !== i)); onActiveDay(undefined); };

  const planned = new Set(trip.days.flatMap((d) => d.placeIds));
  const unplanned = places.filter((p) => p.category !== 'stay' && !planned.has(p.id));
  const hotels = places.filter((p) => p.category === 'stay');
  const nights = Math.max(0, trip.days.length - 1);

  return (
    <aside className="itin" aria-label="Itinerary">
      <div className="itin__head">
        {renaming ? (
          <form className="maplist__edit" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onChange({ ...trip, name: name.trim() }); setRenaming(false); }}>
            <label htmlFor="trip-name" className="sr-only">Trip name</label>
            <input id="trip-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <button className="btn btn--small btn--primary" type="submit">Save</button>
          </form>
        ) : (
          <button className="itin__title" onClick={() => setRenaming(true)} title="Rename trip">
            <h2>{trip.name}</h2>
            <small>{trip.days.length} days · {nights} {nights === 1 ? 'night' : 'nights'} · saved</small>
          </button>
        )}
        <button className="btn btn--ghost btn--small" onClick={onClose}>Back to map</button>
      </div>

      <div className="days">
        <button className={'day-tab' + (!activeDay ? ' day-tab--on' : '')} onClick={() => onActiveDay(undefined)}>All</button>
        {days.map((d, i) => (
          <button key={i} className={'day-tab' + (activeDay === d.day ? ' day-tab--on' : '')} style={activeDay === d.day ? { background: DAY_COLORS[i % DAY_COLORS.length] } : undefined} onClick={() => onActiveDay(d.day)}>Day {d.day}</button>
        ))}
        <button className="day-tab day-tab--add" onClick={addDay}>+ Day</button>
      </div>

      <ol className="itin__list">
        {days.map((d, i) => {
          if (activeDay && d.day !== activeDay) return null;
          const raw = trip.days[i];
          const last = i === days.length - 1;
          const color = DAY_COLORS[i % DAY_COLORS.length];
          return (
            <li key={i} className="itin__day">
              <div className="itin__dayhead">
                <span className="swatch" style={{ background: color }} />
                <strong>Day {d.day}</strong>
                <span className={d.overLimit ? 'warn' : 'muted'}>{fmtMinutes(d.driveMinutes)}{d.overLimit ? ' · over your limit' : ''}</span>
              </div>

              <div className="kinds" role="group" aria-label={`Day ${d.day} type`}>
                {KINDS.map((k) => (
                  <button key={k.id} className={'kind' + (raw.kind === k.id ? ' kind--on' : '')} aria-pressed={raw.kind === k.id} onClick={() => setDay(i, { kind: k.id })}>
                    {k.id === 'flight' && <Svg d="M2 16l20-6-20-6 4 6zM6 10h8" />}
                    {k.id === 'transition' && <Svg d="M4 12h14M13 6l6 6-6 6" />}
                    {k.label}
                  </button>
                ))}
              </div>
              {raw.kind !== 'regular' && (
                <label className="field">{raw.kind === 'flight' ? 'Flight details' : 'Moving from → to'}
                  <input value={raw.note ?? ''} placeholder={raw.kind === 'flight' ? 'e.g. TP 1234 · 10:40 Lisbon → Porto' : 'e.g. Lisbon → Sintra, check out by 11'} onChange={(e) => setDay(i, { note: e.target.value })} />
                </label>
              )}

              {d.places.length > 0 ? (
                <ol className="stops stops--edit">
                  {d.places.map((p, j) => {
                    const c = categoryById(p.category);
                    return (
                      <li key={p.id}>
                        <button className="stop__name" onClick={() => onSelectPlace(p.id)}>
                          <span>{p.name}</span>
                          <small style={{ color: c.color }}>{c.label}{p.mustSee ? ' · Must see' : ''}</small>
                        </button>
                        <span className="stop__tools">
                          <button className="mini" aria-label={`Move ${p.name} up`} disabled={j === 0} onClick={() => move(i, j, j - 1)}><Svg d="M12 19V5M6 11l6-6 6 6" /></button>
                          <button className="mini" aria-label={`Move ${p.name} down`} disabled={j === d.places.length - 1} onClick={() => move(i, j, j + 1)}><Svg d="M12 5v14M6 13l6 6 6-6" /></button>
                          {days.length > 1 && (
                            <select className="mini-select" aria-label={`Move ${p.name} to another day`} value="" onChange={(e) => e.target.value && moveToDay(i, p.id, Number(e.target.value))}>
                              <option value="">Day…</option>
                              {days.map((_, k) => k !== i && <option key={k} value={k}>Day {k + 1}</option>)}
                            </select>
                          )}
                          <button className="mini mini--danger" aria-label={`Remove ${p.name} from this day`} onClick={() => removeStop(i, p.id)}><Svg d="M6 6l12 12M18 6L6 18" /></button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="muted small">{raw.kind === 'regular' ? 'No stops yet.' : 'No stops planned. That’s fine for a travel day.'}</p>
              )}

              {unplanned.length > 0 && (
                <label className="add-stop">
                  <span className="sr-only">Add a place to day {d.day}</span>
                  <select value="" onChange={(e) => e.target.value && addStop(i, e.target.value)}>
                    <option value="">+ Add a place to day {d.day}</option>
                    {unplanned.map((p) => <option key={p.id} value={p.id}>{p.name} · {categoryById(p.category).label}</option>)}
                  </select>
                </label>
              )}

              <div className="night">
                <span className="night__icon" aria-hidden="true"><Svg d="M3 18V8M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6M7 11a1.5 1.5 0 1 0 0 .01" /></span>
                <label className="night__field">
                  <span>{last ? 'Last night / going home' : 'Tonight you stay at'}</span>
                  <select value={raw.stayId ?? ''} onChange={(e) => setDay(i, { stayId: e.target.value || undefined })}>
                    <option value="">{last ? 'No hotel (heading home)' : hotels.length ? 'Choose a hotel…' : 'No hotels saved yet'}</option>
                    {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </label>
              </div>
              {!hotels.length && i === 0 && <p className="muted small">Add hotels to this map (search, then pick the Hotels category) to choose where you sleep each night.</p>}

              {days.length > 1 && (
                <button className="link-btn link-btn--danger" onClick={() => deleteDay(i)}>Delete day {d.day}{d.places.length ? ' (its stops go back to unplanned)' : ''}</button>
              )}
            </li>
          );
        })}
      </ol>

      {unplanned.length > 0 && !activeDay && (
        <p className="muted small">Not in this trip yet: {unplanned.map((p) => p.name).join(', ')}.</p>
      )}
      <p className="muted small">Drive times are rough estimates from straight-line distance, including the drive to that night's hotel.</p>
      {confirmDelete ? (
        <div className="row">
          <button className="btn btn--small btn--danger" onClick={onDelete}>Delete this trip</button>
          <button className="btn btn--small" onClick={() => setConfirmDelete(false)}>Keep it</button>
        </div>
      ) : (
        <button className="link-btn link-btn--danger" onClick={() => setConfirmDelete(true)}>Delete trip</button>
      )}
    </aside>
  );
}

export function TripsPanel({ trips, onOpen, onNew, onClose }: { trips: SavedTrip[]; onOpen: (id: string) => void; onNew: () => void; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Your trips" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2>Your trips</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Svg d="M6 6l12 12M18 6L6 18" /></button>
        </div>
        {trips.length ? (
          <ul className="maplist">
            {[...trips].reverse().map((t) => {
              const n = Math.max(0, t.days.length - 1);
              const flights = t.days.filter((d) => d.kind === 'flight').length;
              return (
                <li key={t.id} className="maplist__item">
                  <button className="maplist__open" onClick={() => onOpen(t.id)}>
                    <strong>{t.name}</strong>
                    <small>{t.days.length} days · {n} {n === 1 ? 'night' : 'nights'} · {t.days.reduce((s, d) => s + d.placeIds.length, 0)} stops{flights ? ` · ${flights} flight ${flights === 1 ? 'day' : 'days'}` : ''}</small>
                  </button>
                  <button className="btn btn--small" onClick={() => onOpen(t.id)}>Open</button>
                </li>
              );
            })}
          </ul>
        ) : <p className="muted">No trips yet. Plan one from the places on this map.</p>}
        <button className="btn btn--primary" onClick={onNew}>Plan a new trip</button>
      </div>
    </div>
  );
}
