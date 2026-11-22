import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFillup, validateVehicle, validateReminder, validateSettings, validatePassphrase, cleanText, isSafeId,
} from '../../public/js/domain/validation.js';
import { reminderStatus, completeReminder, canComplete, rankReminders } from '../../public/js/domain/reminders.js';
import { buildDemoData } from '../../public/js/domain/demo.js';
import { computeSegments } from '../../public/js/domain/consumption.js';

const today = '2026-11-20';
const previous = [
  { id: 'a', date: '2026-10-24', odometer: 47724, liters: 41, pricePerLiter: 1.769, totalCost: 72.53, isFull: true },
  { id: 'b', date: '2026-11-07', odometer: 48320, liters: 38.2, pricePerLiter: 1.749, totalCost: 66.81, isFull: true },
];
const form = (overrides = {}) => ({
  date: '2026-11-19', odometer: '48 916', liters: '37,6', pricePerLiter: '1,739', totalCost: '',
  priceSource: 'price', fuelType: 'E10', isFull: true, station: '  Station   du Centre ', ...overrides,
});

test('un plein valide est nettoyé et le montant calculé', () => {
  const res = validateFillup(form(), { today, others: previous });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.equal(res.value.odometer, 48916);
  assert.equal(res.value.liters, 37.6);
  assert.equal(res.value.totalCost, 65.39);
  assert.equal(res.value.station, 'Station du Centre');
  assert.deepEqual(res.warnings, []);
});

test('le prix au litre est déduit du montant payé', () => {
  const res = validateFillup(form({ priceSource: 'total', totalCost: '65,39', pricePerLiter: '' }), { today, others: previous });
  assert.equal(res.ok, true);
  assert.equal(res.value.pricePerLiter, 1.739);
});

test('le compteur ne peut pas reculer', () => {
  const res = validateFillup(form({ odometer: '48000' }), { today, others: previous });
  assert.equal(res.ok, false);
  assert.match(res.errors.odometer, /Doit dépasser 48\s320\skm/);
});

test('un plein inséré dans le passé doit rester entre ses voisins', () => {
  const res = validateFillup(form({ date: '2026-10-30', odometer: '48400' }), { today, others: previous });
  assert.equal(res.ok, false);
  assert.match(res.errors.odometer, /inférieur à 48\s320\skm/);
});

test('date future, litres manquants, prix absurde et carburant inconnu sont refusés', () => {
  const res = validateFillup(form({ date: '2026-12-01', liters: '', pricePerLiter: '17,39', fuelType: 'KEROSENE' }), { today, others: previous });
  assert.equal(res.ok, false);
  assert.ok(res.errors.date);
  assert.ok(res.errors.liters);
  assert.ok(res.errors.fuelType);
  const res2 = validateFillup(form({ pricePerLiter: '17,39' }), { today, others: previous });
  assert.match(res2.errors.pricePerLiter, /improbable/);
});

test('avertissements : réservoir dépassé et consommation inhabituelle', () => {
  const res = validateFillup(form({ liters: '52', odometer: '48400' }), { today, others: previous, vehicle: { tankCapacity: 45 } });
  assert.equal(res.ok, true);
  assert.equal(res.warnings.length, 2);
  assert.match(res.warnings[0], /capacité du réservoir/);
  assert.match(res.warnings[1], /65,0 L\/100 km/);
  const normal = validateFillup(form({ liters: '52' }), { today, others: previous, vehicle: { tankCapacity: 45 } });
  assert.equal(normal.warnings.length, 1);
});

test('import : les deux valeurs doivent concorder', () => {
  const ok = validateFillup({ ...previous[1], priceSource: 'both', fuelType: 'E10' }, { checkOrder: false });
  assert.equal(ok.ok, true);
  const bad = validateFillup({ ...previous[1], totalCost: 99, priceSource: 'both', fuelType: 'E10' }, { checkOrder: false });
  assert.equal(bad.ok, false);
});

test('textes libres : caractères invisibles et de direction supprimés', () => {
  assert.equal(cleanText(`A${String.fromCharCode(0x202e)}b${String.fromCharCode(0)}c${String.fromCharCode(0x200b)}d`, 10), 'Abcd');
  assert.equal(cleanText('x'.repeat(200), 5), 'xxxxx');
  assert.equal(cleanText(null, 5), '');
  assert.ok(isSafeId('3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90'));
  assert.ok(!isSafeId('../../etc'));
  assert.ok(!isSafeId('<script>'));
});

test('véhicule', () => {
  const res = validateVehicle({ name: ' Clio ', plate: 'ab-123-cd', fuelType: 'E10', tankCapacity: '45', consumptionTarget: '6,0' });
  assert.equal(res.ok, true);
  assert.equal(res.value.plate, 'AB-123-CD');
  assert.equal(res.value.tankCapacity, 45);
  assert.equal(res.value.consumptionTarget, 6);
  const bad = validateVehicle({ name: '', plate: '<b>', fuelType: 'E10', tankCapacity: '900' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.name && bad.errors.plate && bad.errors.tankCapacity);
});

test('rappels : validation', () => {
  assert.equal(validateReminder({ label: 'Vidange', kind: 'km', intervalKm: '15 000', lastKm: '36000' }).ok, true);
  assert.equal(validateReminder({ label: 'CT', kind: 'date', dueDate: '2027-03-12', intervalMonths: '24' }).ok, true);
  assert.equal(validateReminder({ label: 'CT', kind: 'date', dueDate: '2027-03-12', intervalMonths: '' }).value.intervalMonths, null);
  assert.equal(validateReminder({ label: '', kind: 'km', intervalKm: '10', lastKm: 'x' }).ok, false);
});

test('rappels : état, progression et mise à jour après entretien', () => {
  const oil = { label: 'Vidange', kind: 'km', intervalKm: 15000, lastKm: 36000 };
  const ok = reminderStatus(oil, { currentKm: 48320, today });
  assert.equal(ok.state, 'ok');
  assert.match(ok.dueLabel, /^dans 2\s680\skm$/);
  assert.equal(reminderStatus(oil, { currentKm: 50500, today }).state, 'soon');
  assert.match(reminderStatus(oil, { currentKm: 51300, today }).dueLabel, /en retard de 300/);
  assert.equal(completeReminder(oil, { currentKm: 51300, today }).lastKm, 51300);

  const tyres = { label: 'Pneus', kind: 'date', dueDate: '2026-11-15', intervalMonths: 1 };
  const late = reminderStatus(tyres, { today });
  assert.equal(late.state, 'overdue');
  assert.equal(late.dueLabel, 'en retard de 5 jours');
  assert.equal(completeReminder(tyres, { today }).dueDate, '2026-12-20');
  assert.equal(canComplete({ kind: 'date', intervalMonths: null }), false);

  const ranked = rankReminders([oil, tyres], { currentKm: 48320, today });
  assert.equal(ranked[0].reminder, tyres);
});

test('préférences : seules les clés connues passent', () => {
  assert.deepEqual(validateSettings({ unit: 'kml', firstName: ' Clément ', evil: 1, activeVehicleId: '../x' }), { unit: 'kml', firstName: 'Clément' });
  assert.equal(validatePassphrase('court'), 'Au moins 10 caractères.');
  assert.equal(validatePassphrase('un mot de passe long', 'autre chose encore'), 'Les deux mots de passe ne correspondent pas.');
  assert.equal(validatePassphrase('un mot de passe long'), null);
});

test('les données de démo passent toutes la validation, dans l’ordre', () => {
  let n = 0;
  const demo = buildDemoData({ today, newId: () => `id-${++n}`, now: 0 });
  assert.equal(demo.vehicles.length, 1);
  assert.ok(demo.fillups.length >= 14);
  const accepted = [];
  for (const f of demo.fillups) {
    const res = validateFillup({ ...f, priceSource: 'both' }, { today, others: accepted, vehicle: demo.vehicles[0] });
    assert.equal(res.ok, true, JSON.stringify(res.errors));
    assert.deepEqual(res.warnings, [], `${f.date} : ${res.warnings.join(' ')}`);
    accepted.push(f);
  }
  const segments = computeSegments(demo.fillups);
  assert.ok(segments.every((s) => s.l100 > 5.5 && s.l100 < 8));
  for (const r of demo.reminders) assert.equal(validateReminder(r).ok, true);
});
