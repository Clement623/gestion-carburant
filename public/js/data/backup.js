/**
 * Sauvegarde et restauration des données (fichier JSON).
 *
 * Un fichier importé est traité comme hostile tant qu'il n'a pas été vérifié :
 * taille bornée, clés dangereuses supprimées à la lecture, format et version contrôlés,
 * chaque enregistrement revalidé par les règles métier et reconstruit champ par champ,
 * liens entre pleins et véhicules vérifiés. Au moindre problème, rien n'est importé.
 */

import { APP_NAME, APP_VERSION, IMPORT_LIMITS } from '../domain/constants.js';
import { addDays } from '../domain/dates.js';
import { isSafeId, validateFillup, validateReminder, validateSettings, validateVehicle } from '../domain/validation.js';

export const BACKUP_FORMAT = 'suivi-carburant/sauvegarde';
export const BACKUP_VERSION = 1;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_TIMESTAMP = Date.UTC(2100, 0, 1);

export class BackupError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'BackupError';
    this.details = details;
  }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Préférences exportées (les autres, propres à l'appareil, restent sur place). */
const EXPORTED_SETTINGS = ['unit', 'firstName', 'activeVehicleId'];

export function buildBackup(snapshot, now = new Date()) {
  const settings = Object.fromEntries(
    EXPORTED_SETTINGS.filter((key) => snapshot.settings?.[key] != null).map((key) => [key, snapshot.settings[key]]),
  );
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: `${APP_NAME} ${APP_VERSION}`,
    exportedAt: now.toISOString(),
    data: {
      vehicles: snapshot.vehicles,
      fillups: snapshot.fillups,
      reminders: snapshot.reminders,
      settings,
    },
  };
}

/** Lecture JSON défensive : taille bornée, clés __proto__ / constructor / prototype ignorées. */
export function parseJson(text) {
  if (typeof text !== 'string') throw new BackupError('Fichier illisible.');
  if (text.length > IMPORT_LIMITS.maxBytes) throw new BackupError('Fichier trop volumineux (5 Mo maximum).');
  try {
    return JSON.parse(text, (key, value) => (FORBIDDEN_KEYS.has(key) ? undefined : value));
  } catch {
    throw new BackupError("Ce fichier n'est pas une sauvegarde valide (contenu illisible).");
  }
}

function listOf(value, label, max) {
  if (!Array.isArray(value)) throw new BackupError(`Sauvegarde incomplète : liste des ${label} absente.`);
  if (value.length > max) throw new BackupError(`Sauvegarde refusée : trop de ${label} (${max} maximum).`);
  return value;
}

const timestamp = (value, fallback) => (Number.isFinite(value) && value > 0 && value < MAX_TIMESTAMP ? Math.floor(value) : fallback);
const firstErrors = (errors) => Object.values(errors).join(' ');

/**
 * Vérifie une sauvegarde déjà lue (objet JSON) et renvoie des données propres à enregistrer.
 * @throws {BackupError} avec la liste des premiers problèmes trouvés.
 */
export function validateBackup(backup, { today, now = Date.now() }) {
  if (!isPlainObject(backup) || backup.format !== BACKUP_FORMAT) {
    throw new BackupError("Ce fichier n'est pas une sauvegarde de Suivi Carburant.");
  }
  if (backup.version !== BACKUP_VERSION) {
    throw new BackupError('Cette sauvegarde vient d’une version plus récente ou inconnue de l’application.');
  }
  if (!isPlainObject(backup.data)) throw new BackupError('Sauvegarde vide ou endommagée.');

  const problems = [];
  const vehicleIds = new Set();
  const seenIds = new Set();
  const uniqueId = (id) => {
    if (!isSafeId(id) || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  };

  const vehicles = [];
  listOf(backup.data.vehicles, 'véhicules', IMPORT_LIMITS.maxVehicles).forEach((raw, index) => {
    if (!isPlainObject(raw) || !uniqueId(raw.id)) {
      problems.push(`Véhicule n°${index + 1} : identifiant invalide ou en double.`);
      return;
    }
    const check = validateVehicle(raw);
    if (!check.ok) {
      problems.push(`Véhicule n°${index + 1} : ${firstErrors(check.errors)}`);
      return;
    }
    vehicleIds.add(raw.id);
    vehicles.push({ ...check.value, id: raw.id, createdAt: timestamp(raw.createdAt, now), updatedAt: timestamp(raw.updatedAt, now) });
  });

  // Tolérance d'un jour : une sauvegarde faite dans un fuseau horaire en avance reste valable.
  const latestAllowedDate = addDays(today, 1);
  const fillups = [];
  listOf(backup.data.fillups, 'pleins', IMPORT_LIMITS.maxFillups).forEach((raw, index) => {
    if (!isPlainObject(raw) || !uniqueId(raw.id) || !vehicleIds.has(raw.vehicleId)) {
      problems.push(`Plein n°${index + 1} : identifiant ou véhicule invalide.`);
      return;
    }
    const check = validateFillup({ ...raw, priceSource: 'both' }, { today: latestAllowedDate, checkOrder: false });
    if (!check.ok) {
      problems.push(`Plein n°${index + 1} : ${firstErrors(check.errors)}`);
      return;
    }
    fillups.push({
      ...check.value,
      id: raw.id,
      vehicleId: raw.vehicleId,
      createdAt: timestamp(raw.createdAt, now),
      updatedAt: timestamp(raw.updatedAt, now),
    });
  });

  const reminders = [];
  listOf(backup.data.reminders ?? [], 'rappels', IMPORT_LIMITS.maxReminders).forEach((raw, index) => {
    if (!isPlainObject(raw) || !uniqueId(raw.id) || !vehicleIds.has(raw.vehicleId)) {
      problems.push(`Rappel n°${index + 1} : identifiant ou véhicule invalide.`);
      return;
    }
    const check = validateReminder(raw);
    if (!check.ok) {
      problems.push(`Rappel n°${index + 1} : ${firstErrors(check.errors)}`);
      return;
    }
    reminders.push({
      ...check.value,
      id: raw.id,
      vehicleId: raw.vehicleId,
      createdAt: timestamp(raw.createdAt, now),
      updatedAt: timestamp(raw.updatedAt, now),
    });
  });

  if (problems.length > 0) {
    throw new BackupError(`Sauvegarde refusée : ${problems.length} élément(s) invalide(s). Rien n'a été importé.`, problems.slice(0, 5));
  }

  const settings = validateSettings(isPlainObject(backup.data.settings) ? backup.data.settings : {});
  if (!vehicleIds.has(settings.activeVehicleId)) delete settings.activeVehicleId;

  return {
    data: { vehicles, fillups, reminders, settings },
    counts: { vehicles: vehicles.length, fillups: fillups.length, reminders: reminders.length },
  };
}
