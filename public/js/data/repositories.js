/**
 * Dépôts (« repositories ») : la seule porte d'entrée vers les données.
 *
 * Le reste de l'application ne connaît ni IndexedDB ni ses transactions : il appelle
 * vehicles.save(), fillups.listByVehicle()… Pour synchroniser un jour les données avec
 * un serveur, il suffirait de fournir d'autres dépôts avec les mêmes fonctions.
 */

import { STORES } from './db.js';
import { newId } from './ids.js';

export function createRepositories(db, { now = () => Date.now() } = {}) {
  /** Ajoute l'identifiant et les dates de création / modification. */
  const stamp = (record) => {
    const time = now();
    return { ...record, id: record.id ?? newId(), createdAt: record.createdAt ?? time, updatedAt: time };
  };

  const collection = (storeName) => ({
    list: () => db.getAll(storeName),
    get: (id) => db.get(storeName, id),
    async save(record) {
      const value = stamp(record);
      await db.put(storeName, value);
      return value;
    },
    remove: (id) => db.delete(storeName, id),
  });

  const settingsToObject = (rows) => Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return {
    vehicles: {
      ...collection('vehicles'),
      removeWithData: (id) => db.deleteVehicleCascade(id),
    },
    fillups: {
      ...collection('fillups'),
      listByVehicle: (vehicleId) => db.getAllByIndex('fillups', 'byVehicle', vehicleId),
    },
    reminders: {
      ...collection('reminders'),
      listByVehicle: (vehicleId) => db.getAllByIndex('reminders', 'byVehicle', vehicleId),
    },
    settings: {
      getAll: async () => settingsToObject(await db.getAll('settings')),
      set: (key, value) => db.put('settings', { key, value }),
    },
    /** Copie complète des données (pour la sauvegarde). */
    async snapshot() {
      const [vehicles, fillups, reminders, settings] = await Promise.all(STORES.map((name) => db.getAll(name)));
      return { vehicles, fillups, reminders, settings: settingsToObject(settings) };
    },
    replaceAll: (data) => db.replaceAll(data),
    clearAll: () => db.clearAll(),
  };
}
