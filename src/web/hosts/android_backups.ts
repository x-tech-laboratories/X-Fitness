// The phone's backups: whole copies of its database kept in the app's own IndexedDB, apart from the live database.

// ── Imports ──────────────────────────────────────────────────────────────────

import type { BackupStore } from "@x-tech-laboratories/x-libs/backups";

// ── Store ────────────────────────────────────────────────────────────────────

const store_name = "backups";

function open(database_name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database_name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store_name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Runs one request in its own transaction and hands back its result once the transaction is done.
async function run<Result>(database_name: string, mode: IDBTransactionMode, make: (store: IDBObjectStore) => IDBRequest<Result>): Promise<Result> {
  const database = await open(database_name);
  try {
    return await new Promise<Result>((resolve, reject) => {
      const transaction = database.transaction(store_name, mode);
      const request = make(transaction.objectStore(store_name));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

// Each backup is the database's bytes under its name; bytes_of gives the copy to keep at the moment it is taken.
export function indexed_db_backup_store(database_name: string, bytes_of: () => Uint8Array): BackupStore {
  return {
    list: async () => {
      const names = (await run(database_name, "readonly", (store) => store.getAllKeys())) as string[];
      const files = (await run(database_name, "readonly", (store) => store.getAll())) as Uint8Array[];
      return names.map((name, index) => ({ name, size_bytes: files[index]?.byteLength ?? 0 }));
    },
    take: async (name) => {
      const bytes = bytes_of();
      await run(database_name, "readwrite", (store) => store.put(bytes, name));
      return bytes.byteLength;
    },
    remove: async (name) => void (await run(database_name, "readwrite", (store) => store.delete(name))),
  };
}

export async function read_backup(database_name: string, name: string): Promise<Uint8Array> {
  const bytes = (await run(database_name, "readonly", (store) => store.get(name))) as Uint8Array | undefined;
  if (!bytes) throw new Error(`no backup named ${name}`);
  return bytes;
}
