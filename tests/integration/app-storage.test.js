/**
 * Tests d'intégration : couche application + dépôts + vraie logique IndexedDB
 * (simulée en mémoire par fake-indexeddb, qui suit la spécification W3C).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase } from '../../public/js/data/db.js';
import { createRepositories } from '../../public/js/data/repositories.js';
import { createApp } from '../../public/js/app.js';
import { BackupError, BACKUP_FORMAT } from '../../public/js/data/backup.js';
import { CryptoError, encryptText, decryptText } from '../../public/js/data/crypto.js';
import { escapeCsvCell } from '../../public/js/data/csv.js';

const NOW = new Date(2026, 10, 20, 10, 0, 0); // 20 novembre 2026

async function freshApp() {
  const db = await openDatabase({ indexedDB: new IDBFactory() });
  const repos = createRepositories(db);
  const app = createApp({ repos, clock: () => NOW });
  await app.load();
  app.repos = repos; // accès direct pour les vérifications
  return app;
}

async function addFillup(app, overrides) {
  const check = app.checkFillup({
    date: '2026-11-01', odometer: '10000', liters: '40', pricePerLiter: '1,80', totalCost: '',
    priceSource: 'price', fuelType: 'E10', isFull: true, station: '', ...overrides,
  });
  assert.equal(check.ok, true, JSON.stringify(check.errors));
  return app.saveFillup(check.value);
}

test('parcours complet : véhicule, pleins, modification, suppression', async () => {
  const app = await freshApp();
  assert.equal(app.activeVehicle(), null);

  const created = await app.saveVehicle({ name: 'Clio', fuelType: 'E10', tankCapacity: '45', consumptionTarget: '6' });
  assert.equal(created.ok, true);
  assert.equal(app.activeVehicle().name, 'Clio');

  await addFillup(app, { date: '2026-11-01', odometer: '10000' });
  await addFillup(app, { date: '2026-11-08', odometer: '10600', liters: '38,5', pricePerLiter: '1,759' });
  const third = await addFillup(app, { date: '2026-11-15', odometer: '11210', priceSource: 'total', totalCost: '70', liters: '39' });
  assert.equal(third.pricePerLiter, 1.795);
  assert.equal(app.state.fillups.length, 3);
  assert.equal(app.state.analysis.segments.length, 2);
  assert.equal(app.currentOdometer(), 11210);

  // Le compteur ne peut pas reculer.
  const bad = app.checkFillup({ date: '2026-11-18', odometer: '11000', liters: '30', pricePerLiter: '1,8', priceSource: 'price', fuelType: 'E10', isFull: true });
  assert.equal(bad.ok, false);

  // Modification : le même identifiant est conservé.
  const edit = app.checkFillup({ ...third, odometer: String(third.odometer), liters: '39,5', pricePerLiter: String(third.pricePerLiter), priceSource: 'price' }, third.id);
  assert.equal(edit.ok, true, JSON.stringify(edit.errors));
  await app.saveFillup(edit.value, third.id);
  assert.equal(app.findFillup(third.id).liters, 39.5);
  assert.equal(app.state.fillups.length, 3);

  await app.deleteFillup(third.id);
  assert.equal(app.state.fillups.length, 2);

  // Rappels
  const reminder = await app.saveReminder({ label: 'Vidange', kind: 'km', intervalKm: '15000', lastKm: '9000' });
  assert.equal(reminder.ok, true);
  await app.markReminderDone(reminder.value.id);
  assert.equal(app.findReminder(reminder.value.id).lastKm, 10600);

  // Suppression du véhicule : pleins et rappels partent avec lui.
  await app.deleteVehicle(created.value.id);
  assert.equal(app.state.vehicles.length, 0);
  const snapshot = await app.repos.snapshot();
  assert.equal(snapshot.vehicles.length, 0);
  assert.equal(snapshot.fillups.length, 0);
  assert.equal(snapshot.reminders.length, 0);
});

test('plusieurs véhicules : chacun garde ses pleins', async () => {
  const app = await freshApp();
  const a = await app.saveVehicle({ name: 'Voiture A', fuelType: 'E10' });
  await addFillup(app, {});
  const b = await app.saveVehicle({ name: 'Voiture B', fuelType: 'GAZOLE' });
  assert.equal(app.activeVehicle().id, b.value.id);
  assert.equal(app.state.fillups.length, 0);
  await app.setActiveVehicle(a.value.id);
  assert.equal(app.state.fillups.length, 1);
  await app.deleteVehicle(a.value.id);
  assert.equal(app.activeVehicle().id, b.value.id);
});

test('sauvegarde JSON puis restauration sur un autre appareil', async () => {
  const source = await freshApp();
  await source.loadDemo();
  const count = source.state.fillups.length;
  await source.setFirstName('Clément');
  const file = await source.exportBackup();
  assert.match(file.filename, /^suivi-carburant-2026-11-20\.json$/);
  assert.ok(source.state.settings.lastBackupAt);

  const target = await freshApp();
  const parsed = target.readBackup(file.text);
  assert.equal(parsed.encrypted, false);
  assert.equal(parsed.counts.fillups, count);
  await target.importBackup(parsed.data);
  assert.equal(target.state.fillups.length, count);
  assert.equal(target.state.settings.firstName, 'Clément');
  assert.equal(target.activeVehicle().name, 'Ma voiture (démo)');
  assert.deepEqual(
    target.state.analysis.segments.map((s) => s.l100),
    source.state.analysis.segments.map((s) => s.l100),
  );
});

test('sauvegarde chiffrée : bon mot de passe, mauvais mot de passe, fichier modifié', async () => {
  const source = await freshApp();
  await source.loadDemo();
  const file = await source.exportBackup({ passphrase: 'correct horse battery' });
  assert.match(file.filename, /-chiffre\.json$/);
  assert.doesNotMatch(file.text, /Ma voiture/); // rien de lisible en clair

  const target = await freshApp();
  const step = target.readBackup(file.text);
  assert.equal(step.encrypted, true);
  await assert.rejects(() => target.decryptBackup(step.envelope, 'mauvais mot de passe'), CryptoError);

  const tampered = { ...step.envelope, data: `${step.envelope.data.slice(0, -8)}AAAAAAA=` };
  await assert.rejects(() => target.decryptBackup(tampered, 'correct horse battery'), CryptoError);

  const ok = await target.decryptBackup(step.envelope, 'correct horse battery');
  await target.importBackup(ok.data);
  assert.equal(target.state.fillups.length, source.state.fillups.length);
});

test('chiffrement : paramètres piégés refusés avant calcul', async () => {
  const envelope = await encryptText('secret', 'mot de passe solide', { iterations: 100_000 });
  assert.equal(await decryptText(envelope, 'mot de passe solide'), 'secret');
  await assert.rejects(() => decryptText({ ...envelope, kdf: { ...envelope.kdf, iterations: 1e9 } }, 'x'), CryptoError);
  await assert.rejects(() => decryptText({ ...envelope, cipher: { name: 'AES-CBC', iv: envelope.cipher.iv } }, 'x'), CryptoError);
});

test('import : fichiers invalides ou piégés refusés sans rien écrire', async () => {
  const app = await freshApp();
  await app.loadDemo();
  const before = app.state.fillups.length;
  const vehicleId = 'v-1';
  const base = (data) => JSON.stringify({ format: BACKUP_FORMAT, version: 1, data });
  const vehicle = { id: vehicleId, name: 'Test', fuelType: 'E10' };
  const fillup = { id: 'f-1', vehicleId, date: '2026-11-01', odometer: 1000, liters: 40, pricePerLiter: 1.8, totalCost: 72, fuelType: 'E10', isFull: true };

  assert.throws(() => app.readBackup('pas du json'), BackupError);
  assert.throws(() => app.readBackup(JSON.stringify({ format: 'autre' })), BackupError);
  assert.throws(() => app.readBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, data: {} })), BackupError);
  assert.throws(() => app.readBackup('x'.repeat(6 * 1024 * 1024)), /trop volumineux/);
  // Plein rattaché à un véhicule inconnu
  assert.throws(() => app.readBackup(base({ vehicles: [vehicle], fillups: [{ ...fillup, vehicleId: 'inconnu' }], reminders: [] })), BackupError);
  // Identifiant dangereux
  assert.throws(() => app.readBackup(base({ vehicles: [{ ...vehicle, id: '../../x' }], fillups: [], reminders: [] })), BackupError);
  // Valeurs hors limites
  assert.throws(() => app.readBackup(base({ vehicles: [vehicle], fillups: [{ ...fillup, liters: 1e9 }], reminders: [] })), BackupError);

  // Clés de pollution de prototype et champs inconnus : ignorés ; texte nettoyé mais conservé comme texte.
  const tricky = `{"format":"${BACKUP_FORMAT}","version":1,"__proto__":{"admin":true},"data":{"vehicles":[{"id":"${vehicleId}","name":"<img src=x onerror=alert(1)>","fuelType":"E10","__proto__":{"x":1},"extra":"ignoré"}],"fillups":[],"reminders":[],"settings":{"unit":"kml","evil":"1"}}}`;
  const parsed = app.readBackup(tricky);
  assert.equal({}.admin, undefined);
  assert.equal(parsed.data.vehicles[0].name, '<img src=x onerror=alert(1)>'.slice(0, 40));
  assert.equal('extra' in parsed.data.vehicles[0], false);
  assert.deepEqual(parsed.data.settings, { unit: 'kml' });

  assert.equal(app.state.fillups.length, before); // rien n'a été écrit
});

test('export CSV : format français et protection contre les formules', async () => {
  const app = await freshApp();
  await app.saveVehicle({ name: 'Clio', fuelType: 'E10' });
  await addFillup(app, { station: '=HYPERLINK("http://exemple.invalid")' });
  await addFillup(app, { date: '2026-11-08', odometer: '10600', liters: '38,5', pricePerLiter: '1,759', station: 'Relais; "Les Pins"' });
  const { text, filename } = await app.exportCsv();
  assert.equal(filename, 'suivi-carburant-2026-11-20.csv');
  assert.equal(text.charCodeAt(0), 0xfeff);
  const lines = text.slice(1).trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Date;Véhicule;Compteur \(km\);Litres/);
  assert.match(lines[1], /^01\/11\/2026;Clio;10000;40;1,8;72;SP95-E10;oui;;;"'=HYPERLINK\(""http/);
  assert.match(lines[2], /;600;6,42;"Relais; ""Les Pins"""$/);
  assert.equal(escapeCsvCell('-2+3'), "'-2+3");
  assert.equal(escapeCsvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(escapeCsvCell('Normal'), 'Normal');
});

test('données de démo et effacement complet', async () => {
  const app = await freshApp();
  await app.loadDemo();
  assert.ok(app.state.fillups.length >= 14);
  assert.equal(app.state.reminders.length, 3);
  const dash = app.dashboard();
  assert.ok(dash.consumption.l100 > 5.5 && dash.consumption.l100 < 8);
  await app.clearAll();
  assert.equal(app.state.vehicles.length, 0);
  assert.equal(app.activeVehicle(), null);
});
