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
const journalKey = profile => 'conteo-efectivo:draft:' + profile;
export async function readDraft(profile) {
  try {
    const saved = localStorage.getItem(journalKey(profile));
    if (saved !== null) return JSON.parse(saved);
  } catch {
    // An older draft or a restricted storage session can still use IndexedDB.
  }
  return access('drafts', 'readonly', store => store.get(profile));
}
export async function writeDraft(profile, draft) {
  try {
    localStorage.setItem(journalKey(profile), JSON.stringify(draft));
  } catch {
    try { localStorage.removeItem(journalKey(profile)); } catch { /* storage blocked */ }
    await access('drafts', 'readwrite', store => store.put(draft, profile));
  }
}
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
          status: 'synced', baseRevision: record.revision
        });
      };
    }
  });
}
export async function adoptGuest(profile) {
  await access('records', 'readwrite', store => {
    const guest = store.index('profile').getAll('guest');
    guest.onsuccess = () => {
      for (const entry of guest.result) {
        const id = key(profile, entry.record.id);
        const existing = store.get(id);
        existing.onsuccess = () => {
          if (!existing.result) {
            store.put({ ...entry, key: id, profile, status: 'pending' });
            store.delete(entry.key);
          }
        };
      }
    };
  });
  if (await readDraft(profile)) return;
  const guestDraft = await readDraft('guest');
  if (!guestDraft) return;
  await writeDraft(profile, guestDraft);
  try { localStorage.removeItem(journalKey('guest')); } catch { /* storage blocked */ }
  await access('drafts', 'readwrite', store => store.delete('guest'));
}
