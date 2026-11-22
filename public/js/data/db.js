/**
 * Accès à IndexedDB, la base de données intégrée au navigateur.
 *
 * - Une base « suivi-carburant » par site (le navigateur l'isole : aucun autre site ne peut la lire).
 * - Quatre magasins : vehicles, fillups, reminders, settings.
 * - Les évolutions de structure passent par des migrations numérotées (MIGRATIONS[n]).
 * - Chaque opération tourne dans une transaction : tout réussit, ou rien n'est écrit.
 */

export const DB_NAME = 'suivi-carburant';
export const DB_VERSION = 1;
export const STORES = Object.freeze(['vehicles', 'fillups', 'reminders', 'settings']);

/** Migrations : la clé est la version atteinte. Ne jamais modifier une migration déjà publiée, en ajouter une. */
const MIGRATIONS = {
  1(db) {
    db.createObjectStore('vehicles', { keyPath: 'id' });
    const fillups = db.createObjectStore('fillups', { keyPath: 'id' });
    fillups.createIndex('byVehicle', 'vehicleId');
    const reminders = db.createObjectStore('reminders', { keyPath: 'id' });
    reminders.createIndex('byVehicle', 'vehicleId');
    db.createObjectStore('settings', { keyPath: 'key' });
  },
};

export class StorageError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'StorageError';
  }
}

/**
 * Ouvre (ou crée) la base. `indexedDB` est injectable pour les tests (fake-indexeddb).
 * `onVersionChange` est appelé si un autre onglet ouvre une version plus récente de l'appli.
 */
export function openDatabase({ indexedDB = globalThis.indexedDB, name = DB_NAME, onVersionChange } = {}) {
  return new Promise((resolve, reject) => {
    if (!indexedDB) {
      reject(new StorageError("Ce navigateur ne permet pas d'enregistrer des données (stockage local indisponible)."));
      return;
    }
    let request;
    try {
      request = indexedDB.open(name, DB_VERSION);
    } catch (error) {
      reject(new StorageError("Impossible d'ouvrir le stockage local.", error));
      return;
    }
    request.onupgradeneeded = (event) => {
      const db = request.result;
      for (let version = event.oldVersion + 1; version <= DB_VERSION; version += 1) {
        MIGRATIONS[version](db, request.transaction);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        onVersionChange?.();
      };
      resolve(new Database(db));
    };
    request.onerror = () => reject(new StorageError(
      "Impossible d'ouvrir le stockage local. En navigation privée, certains navigateurs le désactivent.",
      request.error,
    ));
    request.onblocked = () => reject(new StorageError(
      "Le stockage est bloqué par un autre onglet de l'application : fermez-le puis rechargez la page.",
    ));
  });
}

export class Database {
  #idb;

  constructor(idb) {
    this.#idb = idb;
  }

  /**
   * Exécute `work(tx, setResult)` dans une transaction et attend sa validation complète.
   * La promesse n'est résolue qu'une fois les données réellement écrites (événement complete).
   */
  #transaction(storeNames, mode, work) {
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = this.#idb.transaction(storeNames, mode);
      } catch (error) {
        reject(new StorageError('Accès au stockage impossible.', error));
        return;
      }
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(new StorageError("L'enregistrement a échoué.", tx.error));
      tx.onabort = () => reject(new StorageError(
        tx.error?.name === 'QuotaExceededError' ? "Espace de stockage plein sur l'appareil." : 'Opération annulée.',
        tx.error,
      ));
      try {
        work(tx, (value) => {
          result = value;
        });
      } catch (error) {
        try {
          tx.abort();
        } catch {
          // la transaction est déjà terminée
        }
        reject(error);
      }
    });
  }

  #read(storeName, makeRequest, fallback) {
    return this.#transaction(storeName, 'readonly', (tx, setResult) => {
      const request = makeRequest(tx.objectStore(storeName));
      request.onsuccess = () => setResult(request.result ?? fallback);
    });
  }

  getAll(storeName) {
    return this.#read(storeName, (store) => store.getAll(), []);
  }

  get(storeName, key) {
    return this.#read(storeName, (store) => store.get(key), null);
  }

  getAllByIndex(storeName, indexName, key) {
    return this.#read(storeName, (store) => store.index(indexName).getAll(key), []);
  }

  put(storeName, value) {
    return this.#transaction(storeName, 'readwrite', (tx) => {
      tx.objectStore(storeName).put(value);
    });
  }

  delete(storeName, key) {
    return this.#transaction(storeName, 'readwrite', (tx) => {
      tx.objectStore(storeName).delete(key);
    });
  }

  /** Supprime un véhicule avec ses pleins et ses rappels, dans une seule transaction. */
  deleteVehicleCascade(vehicleId) {
    return this.#transaction(['vehicles', 'fillups', 'reminders'], 'readwrite', (tx) => {
      tx.objectStore('vehicles').delete(vehicleId);
      for (const storeName of ['fillups', 'reminders']) {
        const store = tx.objectStore(storeName);
        const request = store.index('byVehicle').getAllKeys(vehicleId);
        request.onsuccess = () => {
          for (const key of request.result) store.delete(key);
        };
      }
    });
  }

  /** Remplace tout le contenu (import d'une sauvegarde, démo) : tout ou rien. */
  replaceAll({ vehicles = [], fillups = [], reminders = [], settings = {} }) {
    return this.#transaction([...STORES], 'readwrite', (tx) => {
      for (const storeName of STORES) tx.objectStore(storeName).clear();
      for (const vehicle of vehicles) tx.objectStore('vehicles').put(vehicle);
      for (const fillup of fillups) tx.objectStore('fillups').put(fillup);
      for (const reminder of reminders) tx.objectStore('reminders').put(reminder);
      for (const [key, value] of Object.entries(settings)) tx.objectStore('settings').put({ key, value });
    });
  }

  clearAll() {
    return this.#transaction([...STORES], 'readwrite', (tx) => {
      for (const storeName of STORES) tx.objectStore(storeName).clear();
    });
  }

  close() {
    this.#idb.close();
  }
}
