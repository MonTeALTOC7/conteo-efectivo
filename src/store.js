const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('conteo-efectivo-v1', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('drafts');
    request.result.createObjectStore('records', { keyPath: 'key' }).createIndex('profile', 'profile');
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function access(name, mode, operation) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const result = operation(tx.objectStore(name));
    tx.oncomplete = () => resolve(result?.result);
    tx.onabort = () => reject(tx.error || new Error('Se interrumpió el guardado local.'));
    tx.onerror = () => reject(tx.error);
  });
}
const key = (profile, id) => profile + ':' + id;
export const readDraft = profile => access('drafts', 'readonly', store => store.get(profile));
export const writeDraft = (profile, draft) => access('drafts', 'readwrite', store => store.put(draft, profile));
export const listLocal = profile => access('records', 'readonly', store => store.index('profile').getAll(profile));

export async function changeLocal(profile, id, transform) {
  await access('records', 'readwrite', store => {
    const request = store.get(key(profile, id));
    request.onsuccess = () => {
      const next = transform(request.result);
      if (next === null) store.delete(key(profile, id));
      else if (next) store.put({ ...next, key: key(profile, id), profile });
    };
    return request;
  });
}
export async function importLocal(profile, entries) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    let inserted = 0;
    for (const entry of entries) {
      const id = key(profile, entry.record.id);
      const lookup = store.get(id);
      lookup.onsuccess = () => {
        if (lookup.result) return;
        store.put({ ...entry, key: id, profile });
        inserted++;
      };
    }
    tx.oncomplete = () => resolve(inserted);
    tx.onabort = () => reject(tx.error || new Error('Se interrumpió la importación.'));
    tx.onerror = () => reject(tx.error);
  });
}

export async function mergeRemote(profile, records) {
  return access('records', 'readwrite', store => {
    for (const record of records) {
      const id = key(profile, record.id);
      const request = store.get(id);
      request.onsuccess = () => {
        const local = request.result;
        if (local && local.status !== 'synced' && local.record.mutation !== record.mutation) return;
        if (local && local.record.revision > record.revision) return;
        store.put({
          key: id, profile, record,
          png: local?.record.mutation === record.mutation ? local.png : null,
          status: 'synced', baseRevision: record.revision
        });
      };
    }
  });
}
export async function adoptGuest(profile) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['records', 'drafts'], 'readwrite');
    const records = tx.objectStore('records');
    const drafts = tx.objectStore('drafts');
    const guest = records.index('profile').getAll('guest');
    guest.onsuccess = () => {
      for (const entry of guest.result) {
        const id = key(profile, entry.record.id);
        const existing = records.get(id);
        existing.onsuccess = () => {
          if (!existing.result) {
            records.put({ ...entry, key: id, profile, status: 'pending' });
            records.delete(entry.key);
          }
        };
      }
    };
    const existingDraft = drafts.get(profile);
    existingDraft.onsuccess = () => {
      if (existingDraft.result) return;
      const guestDraft = drafts.get('guest');
      guestDraft.onsuccess = () => {
        if (guestDraft.result) {
          drafts.put(guestDraft.result, profile);
          drafts.delete('guest');
        }
      };
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Se interrumpió la vinculación.'));
    tx.onerror = () => reject(tx.error);
  });
}
