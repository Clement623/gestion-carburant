/**
 * Couche « application » : l'état de l'appli et les actions que l'interface peut déclencher.
 *
 * Les écrans n'écrivent jamais directement dans la base : ils appellent une action
 * (saveFillup, deleteVehicle…) qui valide avec les règles métier, enregistre via les dépôts,
 * puis recharge l'état. Ce module ne touche pas au DOM : il est testable sans navigateur.
 */

import { DASHBOARD_MONTHS, UNITS } from './domain/constants.js';
import { analyzeFillups } from './domain/consumption.js';
import { todayISO } from './domain/dates.js';
import { buildDemoData } from './domain/demo.js';
import { completeReminder } from './domain/reminders.js';
import { buildDashboard } from './domain/stats.js';
import { cleanText, validateFillup, validateReminder, validateVehicle } from './domain/validation.js';
import { BackupError, buildBackup, parseJson, validateBackup } from './data/backup.js';
import { decryptText, encryptText, isEncryptedEnvelope } from './data/crypto.js';
import { fillupsToCsv } from './data/csv.js';
import { newId } from './data/ids.js';
import { LIMITS } from './domain/constants.js';

const EMPTY_ANALYSIS = Object.freeze(analyzeFillups([]));

export function createApp({ repos, clock = () => new Date() }) {
  let state = {
    vehicles: [],
    activeVehicleId: null,
    fillups: [],
    reminders: [],
    settings: {},
    analysis: EMPTY_ANALYSIS,
  };

  const today = () => todayISO(clock());

  /** Recharge l'état depuis la base (après chaque modification). */
  async function load() {
    const [vehicles, settings] = await Promise.all([repos.vehicles.list(), repos.settings.getAll()]);
    vehicles.sort((a, b) => a.createdAt - b.createdAt);
    let activeVehicleId = settings.activeVehicleId;
    if (!vehicles.some((vehicle) => vehicle.id === activeVehicleId)) activeVehicleId = vehicles[0]?.id ?? null;
    const [fillups, reminders] = activeVehicleId
      ? await Promise.all([repos.fillups.listByVehicle(activeVehicleId), repos.reminders.listByVehicle(activeVehicleId)])
      : [[], []];
    reminders.sort((a, b) => a.createdAt - b.createdAt);
    state = { vehicles, activeVehicleId, fillups, reminders, settings, analysis: analyzeFillups(fillups) };
    return state;
  }

  const activeVehicle = () => state.vehicles.find((vehicle) => vehicle.id === state.activeVehicleId) ?? null;
  const currentOdometer = () => state.analysis.sorted.at(-1)?.odometer ?? null;
  const unit = () => (state.settings.unit === UNITS.KML ? UNITS.KML : UNITS.L100);

  function requireVehicle() {
    const vehicle = activeVehicle();
    if (!vehicle) throw new Error("Ajoutez d'abord un véhicule.");
    return vehicle;
  }

  // --- Pleins ---------------------------------------------------------------------------

  function checkFillup(raw, id = null) {
    return validateFillup({ ...raw, id }, {
      today: today(),
      vehicle: activeVehicle(),
      others: state.fillups.filter((fillup) => fillup.id !== id),
    });
  }

  async function saveFillup(value, id = null) {
    const vehicle = requireVehicle();
    const existing = id ? state.fillups.find((fillup) => fillup.id === id) : null;
    if (id && !existing) throw new Error('Ce plein n’existe plus.');
    const saved = await repos.fillups.save({ ...existing, ...value, id: existing?.id, vehicleId: vehicle.id });
    await load();
    return saved;
  }

  async function deleteFillup(id) {
    await repos.fillups.remove(id);
    await load();
  }

  /** Stations déjà saisies, de la plus récente à la plus ancienne (suggestions du formulaire). */
  function stationSuggestions() {
    const names = [];
    for (const fillup of [...state.analysis.sorted].reverse()) {
      if (fillup.station && !names.includes(fillup.station)) names.push(fillup.station);
      if (names.length === 20) break;
    }
    return names;
  }

  // --- Véhicules ------------------------------------------------------------------------

  async function saveVehicle(raw, id = null) {
    const check = validateVehicle(raw);
    if (!check.ok) return check;
    const existing = id ? state.vehicles.find((vehicle) => vehicle.id === id) : null;
    const saved = await repos.vehicles.save({ ...existing, ...check.value, id: existing?.id });
    if (!existing) await repos.settings.set('activeVehicleId', saved.id);
    await load();
    return { ...check, value: saved };
  }

  async function deleteVehicle(id) {
    await repos.vehicles.removeWithData(id);
    if (state.activeVehicleId === id) {
      const next = state.vehicles.find((vehicle) => vehicle.id !== id);
      await repos.settings.set('activeVehicleId', next?.id ?? null);
    }
    await load();
  }

  async function setActiveVehicle(id) {
    if (!state.vehicles.some((vehicle) => vehicle.id === id)) return;
    await repos.settings.set('activeVehicleId', id);
    await load();
  }

  // --- Rappels --------------------------------------------------------------------------

  async function saveReminder(raw, id = null) {
    const vehicle = requireVehicle();
    const check = validateReminder(raw);
    if (!check.ok) return check;
    const existing = id ? state.reminders.find((reminder) => reminder.id === id) : null;
    const saved = await repos.reminders.save({ ...existing, ...check.value, id: existing?.id, vehicleId: vehicle.id });
    await load();
    return { ...check, value: saved };
  }

  async function markReminderDone(id) {
    const reminder = state.reminders.find((item) => item.id === id);
    if (!reminder) return;
    await repos.reminders.save(completeReminder(reminder, { currentKm: currentOdometer(), today: today() }));
    await load();
  }

  async function deleteReminder(id) {
    await repos.reminders.remove(id);
    await load();
  }

  // --- Préférences ----------------------------------------------------------------------

  async function setUnit(value) {
    await repos.settings.set('unit', value === UNITS.KML ? UNITS.KML : UNITS.L100);
    await load();
  }

  async function setFirstName(value) {
    await repos.settings.set('firstName', cleanText(value, LIMITS.firstNameMax));
    await load();
  }

  async function setSetting(key, value) {
    await repos.settings.set(key, value);
    await load();
  }

  // --- Sauvegarde, import, export -------------------------------------------------------

  /** Prépare le fichier de sauvegarde (chiffré si un mot de passe est fourni). */
  async function exportBackup({ passphrase = null } = {}) {
    const backup = buildBackup(await repos.snapshot(), clock());
    let text = JSON.stringify(backup, null, 2);
    let filename = `suivi-carburant-${today()}.json`;
    if (passphrase) {
      text = JSON.stringify(await encryptText(text, passphrase), null, 2);
      filename = `suivi-carburant-${today()}-chiffre.json`;
    }
    await repos.settings.set('lastBackupAt', clock().getTime());
    await load();
    return { filename, text, type: 'application/json' };
  }

  /** Lit un fichier de sauvegarde. Renvoie { encrypted, envelope } ou { data, counts } déjà vérifiés. */
  function readBackup(text) {
    const parsed = parseJson(text);
    if (isEncryptedEnvelope(parsed)) return { encrypted: true, envelope: parsed };
    return { encrypted: false, ...validateBackup(parsed, { today: today(), now: clock().getTime() }) };
  }

  async function decryptBackup(envelope, passphrase) {
    const text = await decryptText(envelope, passphrase);
    const parsed = parseJson(text);
    if (isEncryptedEnvelope(parsed)) throw new BackupError('Sauvegarde chiffrée deux fois : non prise en charge.');
    return { encrypted: false, ...validateBackup(parsed, { today: today(), now: clock().getTime() }) };
  }

  async function importBackup(data) {
    await repos.replaceAll(data);
    await load();
  }

  async function exportCsv() {
    const snapshot = await repos.snapshot();
    return { filename: `suivi-carburant-${today()}.csv`, text: fillupsToCsv(snapshot), type: 'text/csv;charset=utf-8' };
  }

  async function loadDemo() {
    const demo = buildDemoData({ today: today(), newId, now: clock().getTime() });
    const settings = { ...state.settings, ...demo.settings };
    delete settings.lastBackupAt;
    await repos.replaceAll({ ...demo, settings });
    await load();
  }

  async function clearAll() {
    await repos.clearAll();
    await load();
  }

  return {
    get state() {
      return state;
    },
    load,
    today,
    unit,
    activeVehicle,
    currentOdometer,
    dashboard: () => buildDashboard(state.fillups, state.analysis.segments, today(), DASHBOARD_MONTHS),
    findFillup: (id) => state.fillups.find((fillup) => fillup.id === id) ?? null,
    findReminder: (id) => state.reminders.find((reminder) => reminder.id === id) ?? null,
    findVehicle: (id) => state.vehicles.find((vehicle) => vehicle.id === id) ?? null,
    checkFillup,
    saveFillup,
    deleteFillup,
    stationSuggestions,
    saveVehicle,
    deleteVehicle,
    setActiveVehicle,
    saveReminder,
    markReminderDone,
    deleteReminder,
    setUnit,
    setFirstName,
    setSetting,
    exportBackup,
    readBackup,
    decryptBackup,
    importBackup,
    exportCsv,
    loadDemo,
    clearAll,
  };
}
