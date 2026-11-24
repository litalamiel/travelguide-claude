import { useRef, useState } from 'react';
import { CATEGORIES, categoryById } from './categories';
import { fileToDataUrl } from './photos';
import type { CategoryId, PendingPlace, Place } from './types';

function Svg({ d, size = 18 }: { d: string; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

export function Carousel({ photos, alt }: { photos: string[]; alt: string }) {
  const [i, setI] = useState(0);
  if (!photos.length) return null;
  const n = photos.length;
  return (
    <div className="carousel">
      <img src={photos[i % n]} alt={`${alt}, photo ${(i % n) + 1} of ${n}`} />
      {n > 1 && (
        <>
          <button className="carousel__nav carousel__nav--prev" aria-label="Previous photo" onClick={() => setI((i - 1 + n) % n)}><Svg d="M15 6l-6 6 6 6" /></button>
          <button className="carousel__nav carousel__nav--next" aria-label="Next photo" onClick={() => setI((i + 1) % n)}><Svg d="M9 6l6 6-6 6" /></button>
          <span className="carousel__count">{(i % n) + 1} / {n}</span>
        </>
      )}
    </div>
  );
}

function PhotoPicker({ photos, onChange }: { photos: string[]; onChange: (p: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  const add = async (files: FileList | null) => {
    if (!files) return;
    setErr('');
    const out = [...photos];
    for (const f of Array.from(files).slice(0, 10 - photos.length)) {
      if (!f.type.startsWith('image/')) continue;
      try { out.push(await fileToDataUrl(f)); } catch (e) { setErr((e as Error).message); }
    }
    onChange(out);
  };
  return (
    <div className="photos" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
      {photos.map((p, i) => (
        <div key={i} className="photos__item">
          <img src={p} alt={`Photo ${i + 1}`} />
          <button className="photos__remove" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(photos.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      {photos.length < 10 && (
        <button className="photos__add" onClick={() => input.current?.click()}>
          <Svg d="M4 8h3l2-3h6l2 3h3v11H4zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" size={20} />
          Add photos
        </button>
      )}
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      {err && <p className="warn small">{err}</p>}
    </div>
  );
}

/** Option A: the place shows as a preview pin; nothing is saved until "Add to map". */
export function ConfirmPlace({ pending, onChange, onCancel, onAdd }: { pending: PendingPlace; onChange: (p: PendingPlace) => void; onCancel: () => void; onAdd: () => void }) {
  const [moreCats, setMoreCats] = useState(false);
  const first = ['eat', 'coffee', 'drinks', 'sights', 'views', 'nature'] as CategoryId[];
  const shown = moreCats ? CATEGORIES.map((c) => c.id) : Array.from(new Set([pending.category, ...first]));
  const fromReel = pending.source === 'reel';
  return (
    <aside className="confirm" aria-label="Confirm the place">
      <div className="confirm__eyebrow">IS THIS THE RIGHT PLACE?</div>
      <h2>{pending.name}</h2>
      {pending.address && <p className="muted small">{pending.address}</p>}
      <p className="muted small">Check the dashed pin on the map. Drag it if it's slightly off.</p>
      {fromReel && pending.reel && (
        <div className="reel-chip">From a reel{pending.reel.author ? ` by @${pending.reel.author}` : ''}</div>
      )}
      <div className="field-label">Category</div>
      <div className="chips">
        {shown.map((id) => {
          const c = categoryById(id);
          const on = id === pending.category;
          return (
            <button key={id} className={'chip' + (on ? ' chip--on' : '')} style={on ? { background: c.color, borderColor: c.color } : undefined} aria-pressed={on} onClick={() => onChange({ ...pending, category: id })}>{c.label}</button>
          );
        })}
        {!moreCats && <button className="chip" onClick={() => setMoreCats(true)}>More…</button>}
      </div>
      <div className="field-label">{fromReel ? 'Photos from the reel and yours' : 'Your photos'}</div>
      <PhotoPicker photos={pending.photos ?? []} onChange={(photos) => onChange({ ...pending, photos })} />
      <label className="check"><input type="checkbox" checked={!!pending.mustSee} onChange={(e) => onChange({ ...pending, mustSee: e.target.checked })} /> Must see</label>
      <div className="row">
        <button className="btn" onClick={onCancel}>Not this one</button>
        <button className="btn btn--primary" onClick={onAdd}>Add to map</button>
      </div>
    </aside>
  );
}

export function PlaceDetail({ place, onUpdate, onRemove, onClose }: { place: Place; onUpdate: (patch: Partial<Place>) => void; onRemove: () => void; onClose: () => void }) {
  const c = categoryById(place.category);
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <aside className="detail" aria-label={`${place.name} details`}>
      <button className="icon-btn detail__close" aria-label="Close" onClick={onClose}><Svg d="M6 6l12 12M18 6L6 18" size={20} /></button>
      <h2 className="detail__title">{place.name}</h2>
      <div className="detail__source">
        <span className="avatar" style={{ background: place.source === 'reel' ? '#0f766e' : c.tint, color: place.source === 'reel' ? '#fff' : c.color }}>
          {place.source === 'reel' ? (place.reel?.author?.[0]?.toUpperCase() ?? '▶') : <Svg d={c.icon} />}
        </span>
        <span>
          <strong>{place.source === 'reel' ? (place.reel?.author ? `@${place.reel.author}` : 'From a reel') : place.source === 'sample' ? 'Sample place' : 'Added by you'}</strong>
          <small>{c.label}{place.mustSee ? ' · Must see' : ''}{place.visited ? ' · Visited' : ''}</small>
        </span>
      </div>
      <Carousel photos={place.photos ?? []} alt={place.name} />
      {place.reel?.caption && <p className="detail__caption">{place.reel.caption}</p>}
      {place.reelUrl && <a href={place.reelUrl} target="_blank" rel="noreferrer">Watch the reel on Instagram ↗</a>}
      {place.note && !editing && <p className="small">{place.note}</p>}
      {editing ? (
        <div className="detail__edit">
          <label className="field">Category
            <select value={place.category} onChange={(e) => onUpdate({ category: e.target.value as CategoryId })}>
              {CATEGORIES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={!!place.mustSee} onChange={(e) => onUpdate({ mustSee: e.target.checked })} /> Must see</label>
          <label className="field">Your note
            <input value={place.note ?? ''} onChange={(e) => onUpdate({ note: e.target.value })} placeholder="e.g. go early, book ahead" />
          </label>
          <div className="field-label">Photos</div>
          <PhotoPicker photos={place.photos ?? []} onChange={(photos) => onUpdate({ photos })} />
          {confirmRemove ? (
            <div className="row"><button className="btn btn--danger" onClick={onRemove}>Remove from map</button><button className="btn" onClick={() => setConfirmRemove(false)}>Keep</button></div>
          ) : (
            <div className="row"><button className="btn" onClick={() => setEditing(false)}>Done</button><button className="btn btn--danger" onClick={() => setConfirmRemove(true)}>Remove…</button></div>
          )}
        </div>
      ) : (
        <button className="btn btn--small detail__editbtn" onClick={() => setEditing(true)}>Edit</button>
      )}
      <div className="row detail__actions">
        <button className={'btn ' + (place.visited ? '' : 'btn--dark')} onClick={() => onUpdate({ visited: !place.visited })}>{place.visited ? 'Visited ✓' : 'Mark as visited'}</button>
        <a className="btn" href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
      </div>
    </aside>
  );
}
