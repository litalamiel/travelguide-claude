import { useRef, useState } from 'react';
import { CATEGORIES, KIDS, categoryById } from './categories';
import { fileToDataUrl } from './photos';
import type { CategoryId, PendingPlace, Place } from './types';
import { langName, looksNonEnglish, translateToEnglish } from './reel';
import { StoryPlayer } from './Stories';

function Svg({ d, size = 18 }: { d: string; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

type Flags = Pick<Place, 'mustSee' | 'ifTime' | 'kids'>;

/** Must do / Normal / If you have time, plus the Kids friendly tag. */
export function PriorityControl({ value, onChange }: { value: Flags; onChange: (patch: Flags) => void }) {
  const cur = value.mustSee ? 'must' : value.ifTime ? 'time' : 'normal';
  const opts = [
    { id: 'must', label: '★ Must do / see', patch: { mustSee: true, ifTime: false } },
    { id: 'normal', label: 'Normal', patch: { mustSee: false, ifTime: false } },
    { id: 'time', label: 'If you have time', patch: { mustSee: false, ifTime: true } },
  ];
  return (
    <div className="prio">
      <div className="field-label">In the itinerary</div>
      <div className="seg" role="radiogroup" aria-label="Priority in the itinerary">
        {opts.map((o) => (
          <button key={o.id} role="radio" aria-checked={cur === o.id} className={'seg__opt' + (cur === o.id ? ` seg__opt--${o.id}` : '')} onClick={() => onChange(o.patch)}>{o.label}</button>
        ))}
      </div>
      <button className={'chip chip--kids' + (value.kids ? ' chip--kids-on' : '')} aria-pressed={!!value.kids} onClick={() => onChange({ kids: !value.kids })}>
        <span className="kids-badge">{KIDS.text}</span> Kids friendly{value.kids ? ' ✓' : ''}
      </button>
    </div>
  );
}

/** Small tags for priority and Kids friendly. */
export function FlagTags({ place }: { place: Flags }) {
  return <>
    {place.mustSee && <span className="tag tag--must">★ Must do</span>}
    {place.ifTime && <span className="tag tag--time">If you have time</span>}
    {place.kids && <span className="tag tag--kids">Kids friendly</span>}
  </>;
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

type Reel = NonNullable<Place['reel']>;

/** Creator's picture, name and @handle (links to their Instagram profile). */
export function CreatorHeader({ reel, reelUrl }: { reel: Reel; reelUrl?: string }) {
  const handle = reel.author;
  return (
    <div className="creator">
      {reel.avatar ? <img className="creator__avatar" src={reel.avatar} alt="" /> : <span className="creator__avatar creator__avatar--letter">{(reel.authorName ?? handle ?? '?')[0].toUpperCase()}</span>}
      <span className="creator__text">
        <strong>{reel.authorName ?? (handle ? `@${handle}` : 'Instagram creator')}</strong>
        {handle && <a href={`https://www.instagram.com/${handle}/`} target="_blank" rel="noreferrer">@{handle} on Instagram ↗</a>}
      </span>
      {reelUrl && <a className="btn btn--small creator__reel" href={reelUrl} target="_blank" rel="noreferrer">Watch reel ↗</a>}
    </div>
  );
}

/** Caption with an offer to translate it to English and save the English version. */
export function CaptionBlock({ reel, onSave }: { reel: Reel; onSave: (patch: Partial<Reel>) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState<{ text: string; lang?: string }>();
  const [showOriginal, setShowOriginal] = useState(false);
  const caption = reel.caption ?? '';
  if (!caption) return null;
  const translated = !!reel.captionOriginal;
  const offer = !translated && !draft && looksNonEnglish(caption);
  const translate = async () => {
    setBusy(true); setErr('');
    try { setDraft(await translateToEnglish(caption)); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <div className="captionblock">
      {draft ? (
        <>
          <div className="captionblock__banner">English translation from {langName(draft.lang)}. Check it, then save.</div>
          <p className="detail__caption">{draft.text}</p>
          <div className="row">
            <button className="btn btn--small btn--primary" onClick={() => { onSave({ caption: draft.text, captionOriginal: caption, captionLang: draft.lang }); setDraft(undefined); }}>Save in English</button>
            <button className="btn btn--small" onClick={() => setDraft(undefined)}>Keep original</button>
          </div>
        </>
      ) : (
        <p className="detail__caption">{showOriginal && reel.captionOriginal ? reel.captionOriginal : caption}</p>
      )}
      {offer && (
        <div className="captionblock__banner">
          <span>This caption isn’t in English.</span>
          <button className="btn btn--small" onClick={translate} disabled={busy}>{busy ? 'Translating…' : 'Translate to English'}</button>
        </div>
      )}
      {translated && !draft && (
        <button className="link-btn" onClick={() => setShowOriginal(!showOriginal)}>{showOriginal ? 'Show English' : `Show original (${langName(reel.captionLang)})`}</button>
      )}
      {err && <p className="warn small">{err}</p>}
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
      <PriorityControl value={pending} onChange={(patch) => onChange({ ...pending, ...patch })} />
      <div className="row">
        <button className="btn" onClick={onCancel}>Not this one</button>
        <button className="btn btn--primary" onClick={onAdd}>Add to map</button>
      </div>
    </aside>
  );
}

export function PlaceDetail({ place, onUpdate, onRemove, onClose, readOnly, selling, creatorName }: {
  place: Place; onUpdate: (patch: Partial<Place>) => void; onRemove: () => void; onClose: () => void;
  /** Buyer's preview: no editing. */
  readOnly?: boolean;
  /** Creator view: show the Free preview switch. */
  selling?: boolean;
  /** Places on a creator map show the creator above the stories. */
  creatorName?: string;
}) {
  const c = categoryById(place.category);
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (creatorName && place.source !== 'reel') {
    // Design 3A: creator, tags, name, story player, note.
    return (
      <aside className="detail detail--story" aria-label={`${place.name} details`}>
        <button className="icon-btn detail__close" aria-label="Close" onClick={onClose}><Svg d="M6 6l12 12M18 6L6 18" size={20} /></button>
        <div className="card__tags">
          <span className="tag" style={{ background: c.color, color: '#fff' }}>{c.label}</span>
          <FlagTags place={place} />
          {place.free && selling && <span className="tag tag--free">Free preview</span>}
        </div>
        <h2 className="detail__title">{place.name}</h2>
        <div className="detail__source">
          <span className="creator__avatar creator__avatar--letter">{creatorName.replace('@', '')[0]?.toUpperCase()}</span>
          <span><strong>{creatorName}</strong><small>{place.stories?.length ? `${place.stories.length} ${place.stories.length === 1 ? 'story' : 'stories'}` : 'No stories yet'}</small></span>
        </div>
        {place.stories?.length ? <StoryPlayer ids={place.stories} label={place.name} /> : <Carousel photos={place.photos ?? []} alt={place.name} />}
        {readOnly ? (place.note && <p className="detail__note">“{place.note}”</p>) : (
          <label className="field">Your note for travelers
            <textarea rows={2} value={place.note ?? ''} onChange={(e) => onUpdate({ note: e.target.value })} placeholder="e.g. go before 12, book a week ahead" />
          </label>
        )}
        {selling && (
          <>
            <button className={'chip' + (place.free ? ' chip--on' : '')} aria-pressed={!!place.free} onClick={() => onUpdate({ free: !place.free })}>{place.free ? 'Free preview ✓' : 'Make it a free preview'}</button>
            <PriorityControl value={place} onChange={(patch) => onUpdate(patch)} />
            <label className="field">Category
              <select value={place.category} onChange={(e) => onUpdate({ category: e.target.value as CategoryId })}>
                {CATEGORIES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </label>
            <button className="btn btn--small btn--danger" style={{ alignSelf: 'flex-start' }} onClick={onRemove}>Remove place</button>
          </>
        )}
        <a className="btn btn--primary" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([place.name, place.address].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
      </aside>
    );
  }
  return (
    <aside className="detail" aria-label={`${place.name} details`}>
      <button className="icon-btn detail__close" aria-label="Close" onClick={onClose}><Svg d="M6 6l12 12M18 6L6 18" size={20} /></button>
      {place.source === 'reel' && <CreatorHeader reel={place.reel ?? {}} reelUrl={place.reelUrl} />}
      <h2 className="detail__title">{place.name}</h2>
      {place.source !== 'reel' && <div className="detail__source">
        <span className="avatar" style={{ background: c.tint, color: c.color }}><Svg d={c.icon} /></span>
        <span>
          <strong>{place.source === 'sample' ? 'Sample place' : 'Added by you'}</strong>
          <small>{c.label}{place.visited ? ' · Visited' : ''}</small>
        </span>
      </div>}
      {place.source === 'reel' && (
        <div className="card__tags">
          <span className="tag" style={{ background: c.tint, color: c.color }}>{c.label}</span>
          <FlagTags place={place} />
          {place.visited && <span className="tag">Visited</span>}
        </div>
      )}
      <Carousel photos={place.photos ?? []} alt={place.name} />
      {place.reel && <CaptionBlock reel={place.reel} onSave={(patch) => onUpdate({ reel: { ...place.reel, ...patch } })} />}
      {place.source !== 'reel' && (place.mustSee || place.ifTime || place.kids) && <div className="card__tags"><FlagTags place={place} /></div>}
      <PriorityControl value={place} onChange={(patch) => onUpdate(patch)} />
      <label className="field">{place.source === 'reel' ? 'My notes about this reel' : 'My notes'}
        <textarea rows={2} value={place.note ?? ''} onChange={(e) => onUpdate({ note: e.target.value })} placeholder={place.source === 'reel' ? 'e.g. order the octopus, go before sunset, book 2 weeks ahead' : 'e.g. go early, book ahead'} />
      </label>
      {editing ? (
        <div className="detail__edit">
          <label className="field">Category
            <select value={place.category} onChange={(e) => onUpdate({ category: e.target.value as CategoryId })}>
              {CATEGORIES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
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
        <a className="btn" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([place.name, place.address].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
      </div>
    </aside>
  );
}
