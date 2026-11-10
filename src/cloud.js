import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { collection, connectFirestoreEmulator, doc, initializeFirestore, onSnapshot, runTransaction } from 'firebase/firestore';

const env = import.meta.env;
export const emulator = env.VITE_USE_FIREBASE_EMULATOR === '1' && ['localhost', '127.0.0.1'].includes(location.hostname);
export const configured = emulator || Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_AUTH_DOMAIN && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
let auth;
let db;
if (configured) {
  const config = emulator ? {
    apiKey: 'demo-conteo', authDomain: 'demo-conteo-efectivo.firebaseapp.com', projectId: 'demo-conteo-efectivo', appId: '1:123456789:web:1234567890'
  } : {
    apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID
  };
  const app = initializeApp(config);
  auth = getAuth(app);
  db = initializeFirestore(app, {});
  if (emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
}
export function observeAccount(callback) {
  if (auth) return onAuthStateChanged(auth, callback);
  callback(null);
  return () => {};
}
export function connectAccount() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}
export function connectTestAccount(email, password) {
  if (!emulator) throw new Error('Acceso de pruebas desactivado.');
  return signInWithEmailAndPassword(auth, email, password);
}
export const disconnectAccount = () => signOut(auth);
const countDoc = (uid, id) => doc(db, 'users', uid, 'counts', id);
const imageDoc = (uid, id) => doc(db, 'users', uid, 'images', id);
export function observeHistory(uid, callback, onError) {
  return onSnapshot(collection(db, 'users', uid, 'counts'), { includeMetadataChanges: true }, snapshot => {
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) callback(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
  }, onError);
}
export class SyncConflict extends Error {}
export async function push(uid, entry) {
  const recordRef = countDoc(uid, entry.record.id);
  return runTransaction(db, async transaction => {
    const current = (await transaction.get(recordRef)).data();
    if (current?.mutation === entry.record.mutation) return current;
    if (entry.record.deleted && !current && !entry.baseRevision) return null;
    const cancelCreate = entry.record.deleted && current?.mutation === entry.previousMutation;
    if (((current?.revision || 0) !== entry.baseRevision && !cancelCreate) || current?.deleted) {
      throw new SyncConflict('Hay una versión más reciente en otro dispositivo.');
    }
    const record = { ...entry.record, revision: (current?.revision || 0) + 1 };
    transaction.set(recordRef, record);
    if (record.deleted) transaction.delete(imageDoc(uid, record.id));
    return record;
  });
}
