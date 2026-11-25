import { useState } from 'react';
import { categoryById } from './categories';
import { DAY_COLORS } from './MapView';
import { buildTimeline, type Row } from './timeline';
import type { DayKind, DayPlan, Place, SavedTrip, TripDay } from './types';

const P = {
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7',
  car: 'M5 16h14M6 16v3M18 16v3M4 16l2-6h12l2 6M7 13h.01M17 13h.01',
  plane: 'M2 16l20-6-20-6 4 6zM6 10h8',
  bed: 'M3 18V8M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6M7 11a1.5 1.5 0 1 0 0 .01',
  walk: 'M13 4a1.5 1.5 0 1 0 0 .01M10 21l2-6 3 3v3M9 12l3-4 3 3 3 1M12 8l-2 5',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M6 6L4.5 4.5M19.5 19.5L18 18M18 6l1.5-1.5M4.5 19.5L6 18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  sunset: 'M3 18h18M6 14a6 6 0 0 1 12 0M12 4v3M4.5 8.5l2 2M19.5 8.5l-2 2',
  moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
  fork: 'M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9',
  plus: 'M12 5v14M5 12h14',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  x: 'M6 6l12 12M18 6L6 18',
  out: 'M15 4h4v16h-4M10 16l-4-4 4-4M6 12h10',
  in: 'M9 4H5v16h4M14 16l4-4-4-4M18 12H8',
};
function Svg({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
}

const KINDS: { id: DayKind; label: string; hint: string; icon: string; color: string; tint: string }[] = [
  { id: 'regular', label: 'Exploring', hint: 'Same hotel, a day of visits', icon: P.camera, color: '#0f766e', tint: '#ccfbf1' },
  { id: 'transition', label: 'Moving hotels', hint: 'Check out, travel, check in somewhere new', icon: P.car, color: '#c2410c', tint: '#ffedd5' },
  { id: 'flight', label: 'Flight day', hint: 'A flight takes part of the day', icon: P.plane, color: '#7c3aed', tint: '#ede9fe' },
];
const kindOf = (k: DayKind) => KINDS.find((x) => x.id === k)!;

type Part = 'Morning' | 'Lunch' | 'Afternoon' | 'Evening' | 'Dinner' | 'Night';
const PARTS: Record<Part, { icon: string; color: string; bg: string }> = {
  Morning: { icon: P.sun, color: '#a16207', bg: '#fffbeb' },
  Lunch: { icon: P.fork, color: '#b91c1c', bg: '#fff1f2' },
  Afternoon: { icon: P.sun, color: '#a16207', bg: '#fffbeb' },
  Evening: { icon: P.sunset, color: '#9a3412', bg: '#fff7ed' },
  Dinner: { icon: P.fork, color: '#b91c1c', bg: '#fff1f2' },
  Night: { icon: P.moon, color: '#0f172a', bg: '#f1f5f9' },
};
const toM = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function partOf(r: Row): Part {
  if (r.kind === 'night') return 'Night';
  if (r.kind === 'leg') return 'Morning';
  if (r.kind === 'meal') return r.meal;
  if (r.kind === 'stop' && (r.meal === 'Lunch' || r.meal === 'Dinner')) return r.meal;
  const m = toM(r.time);
  if (m < 12 * 60) return 'Morning';
  if (m < 17 * 60 + 30) return 'Afternoon';
  return 'Evening';
}
/** Group the timeline into blocks; travel legs join the block of the stop they lead to. */
function group(rows: Row[]) {
  const blocks: { part: Part; rows: Row[] }[] = [];
  let pending: Row[] = [];
  for (const r of rows) {
    if (r.kind === 'leg') { pending.push(r); continue; }
    const part = partOf(r);
    const lastB = blocks[blocks.length - 1];
    if (lastB && lastB.part === part) lastB.rows.push(...pending, r);
    else blocks.push({ part, rows: [...pending, r] });
    pending = [];
  }
  return blocks;
}

/** Saved trip shown as a timeline with times, grouped by time of day. */
export function Itinerary({ trip, days, places, activeDay, onActiveDay, onChange, onClose, onDelete, onSelectPlace }: {
  trip: SavedTrip; days: DayPlan[]; places: Place[];
  activeDay?: number; onActiveDay: (d?: number) => void;
  onChange: (t: SavedTrip) => void; onClose: () => void; onDelete: () => void;
  onSelectPlace: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(trip.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editTime, setEditTime] = useState<string>();

  const edit = (fn: (ds: TripDay[]) => TripDay[]) => onChange({ ...trip, days: fn(trip.days.map((d) => ({ ...d, placeIds: [...d.placeIds] }))) });
  const setDay = (i: number, patch: Partial<TripDay>) => edit((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const move = (i: number, from: number, to: number) => edit((ds) => { const ids = ds[i].placeIds; const [x] = ids.splice(from, 1); ids.splice(to, 0, x); return ds; });
  const moveToDay = (i: number, id: string, target: number) => edit((ds) => { ds[i].placeIds = ds[i].placeIds.filter((x) => x !== id); ds[target].placeIds.push(id); return ds; });
  const removeStop = (i: number, id: string) => edit((ds) => { ds[i].placeIds = ds[i].placeIds.filter((x) => x !== id); return ds; });
  const addStop = (i: number, id: string) => edit((ds) => { ds[i].placeIds.push(id); return ds; });
  const setTime = (i: number, id: string, t: string) => edit((ds) => { const times = { ...(ds[i].times ?? {}) }; if (t) times[id] = t; else delete times[id]; ds[i].times = times; return ds; });
  const addDay = () => { edit((ds) => [...ds, { placeIds: [], kind: 'regular' }]); onActiveDay(trip.days.length + 1); };
  const deleteDay = (i: number) => { edit((ds) => ds.filter((_, j) => j !== i)); onActiveDay(undefined); };

  const planned = new Set(trip.days.flatMap((d) => d.placeIds));
  const unplanned = places.filter((p) => p.category !== 'stay' && !planned.has(p.id));
  const hotels = places.filter((p) => p.category === 'stay');
  const nights = Math.max(0, trip.days.length - 1);
  const dayTitle = (d: DayPlan, raw: TripDay, i: number) =>
    raw.kind === 'transition' && days[i - 1]?.stay && d.stay ? `${days[i - 1].stay!.name.split(' ')[0]} → ${d.stay.name.split(' ')[0]}` : d.area || kindOf(raw.kind).label;

  const i = activeDay ? activeDay - 1 : -1;
  const d = i >= 0 ? days[i] : undefined;
  const raw = i >= 0 ? trip.days[i] : undefined;

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
            <small className="eyebrow">YOUR TRIP · {trip.days.length} DAYS, {nights} {nights === 1 ? 'NIGHT' : 'NIGHTS'}</small>
            <h2>{trip.name}</h2>
          </button>
        )}
        <button className="btn btn--ghost btn--small" onClick={onClose}>Back to map</button>
      </div>

      <div className="daystrip" role="tablist" aria-label="Days">
        <button role="tab" aria-selected={!activeDay} className={'daychip' + (!activeDay ? ' daychip--on' : '')} onClick={() => onActiveDay(undefined)}>
          <small>Overview</small><strong>All days</strong>
        </button>
        {days.map((dd, k) => {
          const kd = kindOf(trip.days[k].kind);
          const on = activeDay === dd.day;
          return (
            <button key={k} role="tab" aria-selected={on} className={'daychip' + (on ? ' daychip--on' : '')} style={on ? { borderColor: kd.color, background: kd.tint } : undefined} onClick={() => onActiveDay(dd.day)}>
              <small style={{ color: kd.color }}><Svg d={kd.icon} size={13} /> Day {dd.day}</small>
              <strong>{dayTitle(dd, trip.days[k], k)}</strong>
            </button>
          );
        })}
        <button className="daychip daychip--add" onClick={addDay}><small>New</small><strong>+ Day</strong></button>
      </div>

      {!d || !raw ? (
        <ol className="overview">
          {days.map((dd, k) => {
            const kd = kindOf(trip.days[k].kind);
            return (
              <li key={k}>
                <button className="overview__day" onClick={() => onActiveDay(dd.day)}>
                  <span className="swatch" style={{ background: DAY_COLORS[k % DAY_COLORS.length] }} />
                  <span className="overview__text">
                    <strong>Day {dd.day} · {dayTitle(dd, trip.days[k], k)}</strong>
                    <small>{dd.places.length} {dd.places.length === 1 ? 'stop' : 'stops'}{dd.stay ? ` · sleep at ${dd.stay.name}` : ''}</small>
                  </span>
                  <span className="kindtag" style={{ background: kd.tint, color: kd.color }}><Svg d={kd.icon} size={14} />{kd.label}</span>
                </button>
              </li>
            );
          })}
          {unplanned.length > 0 && <li className="muted small">Not in this trip yet: {unplanned.map((p) => p.name).join(', ')}.</li>}
        </ol>
      ) : (
        <DayView
          key={i}
          d={d} raw={raw} i={i} last={i === days.length - 1} prevStay={days[i - 1]?.stay} title={dayTitle(d, raw, i)}
          days={days} unplanned={unplanned} hotels={hotels} editTime={editTime} setEditTime={setEditTime}
          setDay={setDay} move={move} moveToDay={moveToDay} removeStop={removeStop} addStop={addStop} setTime={setTime}
          deleteDay={days.length > 1 ? () => deleteDay(i) : undefined} onSelectPlace={onSelectPlace}
        />
      )}

      <p className="muted small">Times and travel are estimates from typical visit lengths and straight-line distance. Tap a time to set it yourself.</p>
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

function DayView({ d, raw, i, last, prevStay, title, days, unplanned, hotels, editTime, setEditTime, setDay, move, moveToDay, removeStop, addStop, setTime, deleteDay, onSelectPlace }: {
  d: DayPlan; raw: TripDay; i: number; last: boolean; prevStay?: Place; title: string;
  days: DayPlan[]; unplanned: Place[]; hotels: Place[];
  editTime?: string; setEditTime: (id?: string) => void;
  setDay: (i: number, p: Partial<TripDay>) => void;
  move: (i: number, from: number, to: number) => void;
  moveToDay: (i: number, id: string, target: number) => void;
  removeStop: (i: number, id: string) => void;
  addStop: (i: number, id: string) => void;
  setTime: (i: number, id: string, t: string) => void;
  deleteDay?: () => void;
  onSelectPlace: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const kd = kindOf(raw.kind);
  const rows = buildTimeline(d, raw, prevStay, i, last);
  const blocks = group(rows);
  const stops = rows.filter((r) => r.kind === 'stop');
  const legs = rows.filter((r): r is Row & { kind: 'leg' } => r.kind === 'leg');
  const driving = legs.filter((l) => l.mode === 'drive').reduce((s, l) => s + l.min, 0);
  const first = rows.find((r) => r.kind !== 'leg') as { time: string } | undefined;
  const fmt = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);

  const addSelect = (label: string) => unplanned.length > 0 && (
    <label className="slot slot--add">
      <span className="sr-only">{label}</span>
      <select value="" onChange={(e) => e.target.value && addStop(i, e.target.value)}>
        <option value="">{label}</option>
        {unplanned.map((p) => <option key={p.id} value={p.id}>{p.name} · {categoryById(p.category).label}</option>)}
      </select>
    </label>
  );

  return (
    <div className="dayview">
      <div className="dayview__head">
        <h3>Day {d.day} · {title}</h3>
        <span className="kindtag" style={{ background: kd.tint, color: kd.color }}><Svg d={kd.icon} size={15} />{kd.label}</span>
        <button className={'btn btn--small dayview__edit' + (editing ? ' btn--primary' : '')} aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit day'}</button>
      </div>
      <p className="muted small">{stops.length} {stops.length === 1 ? 'stop' : 'stops'} · {driving ? `${fmt(driving)} driving` : 'no driving'}{first ? ` · from ${first.time}` : ''}{d.overLimit ? ' · more driving than you wanted' : ''}</p>

      {editing && <>
      <fieldset className="daytype">
        <legend>What kind of day is this?</legend>
        {KINDS.map((k) => (
          <label key={k.id} className={'daytype__opt' + (raw.kind === k.id ? ' daytype__opt--on' : '')} style={raw.kind === k.id ? { borderColor: k.color, background: k.tint } : undefined}>
            <input type="radio" name={`kind-${i}`} checked={raw.kind === k.id} onChange={() => setDay(i, { kind: k.id })} />
            <span className="daytype__icon" style={{ color: k.color }}><Svg d={k.icon} /></span>
            <span><strong>{k.label}</strong><small>{k.hint}</small></span>
          </label>
        ))}
      </fieldset>
      {raw.kind === 'flight' && (
        <div className="grid2">
          <label className="field">Flight<input value={raw.note ?? ''} placeholder="e.g. TP 1234 Lisbon → Porto" onChange={(e) => setDay(i, { note: e.target.value })} /></label>
          <label className="field">Departs<input type="time" value={raw.flightTime ?? '10:40'} onChange={(e) => setDay(i, { flightTime: e.target.value })} /></label>
        </div>
      )}
      <label className="field field--inline">Day starts at
        <input type="time" value={raw.startTime ?? (raw.kind === 'flight' ? '07:30' : raw.kind === 'transition' ? '10:00' : '09:00')} onChange={(e) => setDay(i, { startTime: e.target.value || undefined })} />
      </label>
      </>}

      {blocks.map((b, bi) => {
        const pi = PARTS[b.part];
        return (
          <section key={bi} className="part" style={{ background: pi.bg }}>
            <h4 className="part__head" style={{ color: pi.color }}><Svg d={pi.icon} size={16} />{b.part.toUpperCase()}</h4>
            <ol className="tl">
              {b.rows.map((r, ri) => {
                if (r.kind === 'leg') {
                  return <li key={ri} className="tl__leg"><span /><span className="tl__dash" /><span><Svg d={r.mode === 'walk' ? P.walk : P.car} size={14} /> {r.min} min {r.mode === 'walk' ? 'walk' : 'drive'}</span></li>;
                }
                if (r.kind === 'stop') {
                  const p = r.place; const c = categoryById(p.category);
                  const food = !!r.meal;
                  return (
                    <li key={ri} className="tl__row">
                      {editTime === p.id ? (
                        <input className="tl__timeinput" type="time" aria-label={`Time for ${p.name}`} defaultValue={r.time} autoFocus
                          onBlur={(e) => { setTime(i, p.id, e.target.value); setEditTime(undefined); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                      ) : (
                        <button className={'tl__time' + (r.fixed ? ' tl__time--fixed' : '')} onClick={() => (editing ? setEditTime(p.id) : onSelectPlace(p.id))} aria-label={editing ? `${r.time}, change time for ${p.name}` : `${r.time}, show ${p.name} on the map`}>{r.time}</button>
                      )}
                      <span className="tl__badge" style={{ background: c.tint, color: c.color }}><Svg d={c.icon} /></span>
                      <div className={'tl__card' + (food ? ' tl__card--food' : '')}>
                        <button className="tl__name" onClick={() => onSelectPlace(p.id)}>
                          <strong>{p.name}</strong>
                          {p.mustSee && <span className="tag tag--must">★ Must do</span>}
                          {p.ifTime && <span className="tag tag--time">If you have time</span>}
                          {p.kids && <span className="tag tag--kids">Kids</span>}
                          <small style={food ? { color: '#b91c1c', fontWeight: 700 } : undefined}>{r.meal ? `${r.meal} · ` : ''}{c.label} · {r.minutes < 60 ? `${r.minutes} min` : `${Math.round(r.minutes / 30) / 2} h`}</small>
                        </button>
                        {editing && <span className="stop__tools">
                          <button className="mini" aria-label={`Move ${p.name} earlier`} disabled={r.index === 0} onClick={() => move(i, r.index, r.index - 1)}><Svg d={P.up} size={16} /></button>
                          <button className="mini" aria-label={`Move ${p.name} later`} disabled={r.index === d.places.length - 1} onClick={() => move(i, r.index, r.index + 1)}><Svg d={P.down} size={16} /></button>
                          {days.length > 1 && (
                            <select className="mini-select" aria-label={`Move ${p.name} to another day`} value="" onChange={(e) => e.target.value && moveToDay(i, p.id, Number(e.target.value))}>
                              <option value="">Day…</option>
                              {days.map((_, k) => k !== i && <option key={k} value={k}>Day {k + 1}</option>)}
                            </select>
                          )}
                          <button className="mini mini--danger" aria-label={`Remove ${p.name} from this day`} onClick={() => removeStop(i, p.id)}><Svg d={P.x} size={16} /></button>
                        </span>}
                      </div>
                    </li>
                  );
                }
                if (r.kind === 'meal') {
                  const food = unplanned.filter((p) => p.category === 'eat' || p.category === 'coffee' || p.category === 'drinks');
                  return (
                    <li key={ri} className="tl__row">
                      <span className="tl__timetext">{r.time}</span>
                      <span className="tl__badge" style={{ background: '#fee2e2', color: '#b91c1c' }}><Svg d={P.fork} /></span>
                      <label className="slot">
                        <span className="sr-only">Pick a {r.meal.toLowerCase()} spot</span>
                        <select value="" onChange={(e) => e.target.value && addStop(i, e.target.value)}>
                          <option value="">+ Pick a {r.meal.toLowerCase()} spot</option>
                          {food.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          {!food.length && <option disabled>Save restaurants to your map first</option>}
                        </select>
                      </label>
                    </li>
                  );
                }
                if (r.kind === 'milestone') {
                  const icon = r.icon === 'flight' ? P.plane : r.icon === 'drive' ? P.car : r.icon === 'checkout' ? P.out : P.in;
                  const color = r.icon === 'flight' ? '#7c3aed' : r.icon === 'drive' ? '#c2410c' : '#0f172a';
                  const tint = r.icon === 'flight' ? '#ede9fe' : r.icon === 'drive' ? '#ffedd5' : '#e2e8f0';
                  return (
                    <li key={ri} className="tl__row">
                      <span className="tl__timetext">{r.time}</span>
                      <span className="tl__badge" style={{ background: tint, color }}><Svg d={icon} /></span>
                      <div className="tl__milestone" style={{ background: tint }}>
                        <strong>{r.title}</strong>{r.sub && <small>{r.sub}</small>}
                        <span className="tl__flag" style={{ color }}>Milestone</span>
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={ri} className="tl__row">
                    <span className="tl__timetext">{r.time}</span>
                    <span className="tl__badge tl__badge--night"><Svg d={P.bed} /></span>
                    <label className="tl__night">
                      <small>{r.last ? 'End of the trip' : `Night ${r.nightNo} · sleep at`}</small>
                      <select value={raw.stayId ?? ''} onChange={(e) => setDay(i, { stayId: e.target.value || undefined })}>
                        <option value="">{r.last ? 'Heading home (no hotel)' : hotels.length ? 'Choose a hotel…' : 'No hotels saved yet'}</option>
                        {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                      </select>
                    </label>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      {!hotels.length && <p className="muted small">To choose where you sleep, save hotels to this map (search, then pick the Hotels category).</p>}
      {addSelect(`+ Add a place to day ${d.day}`)}
      {editing && deleteDay && <button className="link-btn link-btn--danger" onClick={deleteDay}>Delete day {d.day}{d.places.length ? ' (its stops go back to unplanned)' : ''}</button>}
    </div>
  );
}

export function TripsPanel({ trips, onOpen, onNew, onClose }: { trips: SavedTrip[]; onOpen: (id: string) => void; onNew: () => void; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Your trips" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2>Your trips</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Svg d={P.x} /></button>
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
