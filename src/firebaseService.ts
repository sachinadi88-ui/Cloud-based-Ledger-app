import { 
  doc, 
  getDoc, 
  getDocs, 
  collection, 
  writeBatch, 
  serverTimestamp, 
  setDoc 
} from 'firebase/firestore';
import { db, handleFirestoreError } from './firebase';
import { LedgerRow, OperationType } from './types';

/**
 * Loads user profile (people metadata) and ledger rows sorted by index
 */
export async function loadUserData(userId: string) {
  const path = `users/${userId}`;
  try {
    // 1. Fetch User Profile Doc
    const profileRef = doc(db, 'users', userId);
    const profileSnap = await getDoc(profileRef);
    let people: string[] = [];
    if (profileSnap.exists()) {
      people = profileSnap.data().people || [];
    }

    // 2. Fetch Entries Subcollection
    const entriesRef = collection(db, 'users', userId, 'entries');
    const entriesSnap = await getDocs(entriesRef);
    
    const rows: LedgerRow[] = [];
    entriesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      rows.push({
        id: docSnap.id,
        particulars1: data.particulars1 || '',
        particulars2: data.particulars2 || '',
        amount: Number(data.amount) || 0,
        paymentMode: data.paymentMode || 'Online',
        person: data.person || ''
      });
    });

    // Preserve users original sorting index if available
    const sortedRows = [...rows];
    // We fetch and store index separately inside the database to keep clean array representation
    const entriesMap = new Map<string, number>();
    entriesSnap.forEach((docSnap) => {
      entriesMap.set(docSnap.id, docSnap.data().index ?? 9999);
    });
    sortedRows.sort((a, b) => (entriesMap.get(a.id) ?? 0) - (entriesMap.get(b.id) ?? 0));

    return { people, rows: sortedRows };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Saves everything with batch operations
 */
export async function saveUserData(
  userId: string, 
  email: string, 
  people: string[], 
  rows: LedgerRow[]
) {
  const path = `users/${userId}`;
  try {
    // 1. Update Profile Document
    const profileRef = doc(db, 'users', userId);
    await setDoc(profileRef, {
      uid: userId,
      email: email,
      people: people,
      updatedAt: serverTimestamp()
    });

    // 2. Load existing entry list to resolve what to delete & reuse creation timestamps
    const entriesRef = collection(db, 'users', userId, 'entries');
    const existingSnap = await getDocs(entriesRef);
    
    const existingDocsMap = new Map<string, any>();
    existingSnap.forEach((docSnap) => {
      existingDocsMap.set(docSnap.id, docSnap.data());
    });

    const batch = writeBatch(db);

    // Identify stale items in database to delete
    const currentIds = new Set(rows.map(r => r.id));
    existingSnap.forEach((docSnap) => {
      if (!currentIds.has(docSnap.id)) {
        const docToDelete = doc(db, 'users', userId, 'entries', docSnap.id);
        batch.delete(docToDelete);
      }
    });

    // Upsert existing/new rows maintaining strict schemas
    rows.forEach((row, index) => {
      const entryDocRef = doc(db, 'users', userId, 'entries', row.id);
      const existingData = existingDocsMap.get(row.id);

      if (existingData) {
        // Safe Update
        batch.set(entryDocRef, {
          id: row.id,
          particulars1: row.particulars1 || '',
          particulars2: row.particulars2 || '',
          amount: Number(row.amount) || 0,
          paymentMode: row.paymentMode || 'Online',
          person: row.person || '',
          index: index,
          createdAt: existingData.createdAt, // Preserve original timestamp
          updatedAt: serverTimestamp()
        });
      } else {
        // Safe Creation
        batch.set(entryDocRef, {
          id: row.id,
          particulars1: row.particulars1 || '',
          particulars2: row.particulars2 || '',
          amount: Number(row.amount) || 0,
          paymentMode: row.paymentMode || 'Online',
          person: row.person || '',
          index: index,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
