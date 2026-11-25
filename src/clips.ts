// Story videos a creator uploads (downloaded from their Instagram highlight).
// They are kept in this browser's IndexedDB: too big for localStorage, and there is no shared storage yet.
const DB = 'travelmaps-clips';
const STORE = 'clips';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Video storage is unavailable in this browser.'));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { resolve(req.result); db.close(); };
    tx.onerror = tx.onabort = () => { reject(tx.error ?? new Error('Couldn’t save the video.')); db.close(); };
  });
}

export const newClipId = () => 'clip_' + Math.random().toString(36).slice(2, 10);
export const saveClip = (id: string, blob: Blob) => run('readwrite', (s) => s.put(blob, id)).then(() => id);
export const getClip = (id: string) => run<Blob | undefined>('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>);
export const deleteClip = (id: string) => run('readwrite', (s) => s.delete(id)).then(() => undefined);

/** A small portrait JPEG from about half a second into the video, for thumbnails and pins. */
export function videoThumb(blob: Blob, w = 180): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    const done = (fn: () => void) => { URL.revokeObjectURL(url); fn(); };
    v.onloadedmetadata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); };
    v.onseeked = () => {
      const scale = w / (v.videoWidth || w);
      const c = document.createElement('canvas');
      c.width = w; c.height = Math.round((v.videoHeight || w * 16 / 9) * scale);
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
      done(() => resolve(c.toDataURL('image/jpeg', 0.7)));
    };
    v.onerror = () => done(() => reject(new Error('This video format can’t be read in this browser.')));
  });
}
