import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDecimal, parseInteger, round, formatEuro, formatKm, formatLiters, formatPricePerLiter,
  formatConsumption, formatSigned, consumptionValue, toInputFixed, plural,
} from '../../public/js/domain/numbers.js';
import {
  isValidISODate, addMonths, addDays, daysBetween, lastMonthKeys, monthEnd, previousMonthKey,
  formatDayMonth, formatMonthYear, formatWeekdayDayMonth, todayISO,
} from '../../public/js/domain/dates.js';

// Intl fr-FR utilise des espaces insécables : on les normalise pour comparer.
const plain = (text) => text.replace(/\s/g, ' ');
const NNBSP = String.fromCharCode(0x202f);

test('parseDecimal accepte la virgule, le point et les espaces', () => {
  assert.equal(parseDecimal('38,2'), 38.2);
  assert.equal(parseDecimal('38.2'), 38.2);
  assert.equal(parseDecimal(' 1 749,5 '), 1749.5);
  assert.equal(parseDecimal(',5'), 0.5);
  assert.equal(parseDecimal('12'), 12);
  assert.equal(parseDecimal(12.5), 12.5);
});

test('parseDecimal refuse ce qui n’est pas un nombre positif', () => {
  for (const bad of ['', 'abc', '-3', '1,2,3', '1e5', '12€', null, undefined, Number.NaN, Infinity]) {
    assert.ok(Number.isNaN(parseDecimal(bad)), `devrait refuser ${String(bad)}`);
  }
});

test('parseInteger gère les séparateurs de milliers', () => {
  assert.equal(parseInteger('48320'), 48320);
  assert.equal(parseInteger('48 320'), 48320);
  assert.equal(parseInteger(`48${NNBSP}320`), 48320);
  assert.equal(parseInteger('48.320'), 48320);
  assert.equal(parseInteger('2.000.000'), 2000000);
  assert.ok(Number.isNaN(parseInteger('48,3')));
  assert.ok(Number.isNaN(parseInteger('12.5')));
  assert.ok(Number.isNaN(parseInteger('-5')));
});

test('round arrondit correctement les cas limites', () => {
  assert.equal(round(1.005, 2), 1.01);
  assert.equal(round(66.80999999, 2), 66.81);
  assert.equal(round(38.2 * 1.749, 2), 66.81);
  assert.equal(round(0.1 + 0.2, 2), 0.3);
});

test('formats français', () => {
  assert.equal(plain(formatEuro(1234.5)), '1 234,50 €');
  assert.equal(plain(formatKm(48320)), '48 320 km');
  assert.equal(plain(formatLiters(38.2)), '38,2 L');
  assert.equal(plain(formatPricePerLiter(1.749)), '1,749 €/L');
  assert.equal(plain(formatConsumption(6.41, 'l100')), '6,4 L/100 km');
  assert.equal(plain(formatConsumption(6.25, 'kml')), '16,0 km/L');
  assert.equal(formatSigned(-0.12), '−0,1');
  assert.equal(formatSigned(0.26), '+0,3');
  assert.equal(formatSigned(0.01), '±0,0');
  assert.equal(consumptionValue(5, 'kml'), 20);
  assert.equal(consumptionValue(null, 'l100'), null);
  assert.equal(toInputFixed(66.8, 2), '66,80');
  assert.equal(plural(1, 'plein'), '1 plein');
  assert.equal(plural(3, 'plein'), '3 pleins');
});

test('dates ISO : validité et calculs', () => {
  assert.ok(isValidISODate('2026-02-28'));
  assert.ok(isValidISODate('2028-02-29'));
  assert.ok(!isValidISODate('2026-02-29'));
  assert.ok(!isValidISODate('2026-13-01'));
  assert.ok(!isValidISODate('26-01-01'));
  assert.ok(!isValidISODate(20260101));
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-11-15', -11), '2025-12-15');
  assert.equal(addMonths('2026-03-10', 24), '2028-03-10');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-11-01', '2026-11-20'), 19);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2); // passage à l'heure d'été sans effet
  assert.deepEqual(lastMonthKeys(3, '2026-01-15'), ['2025-11', '2025-12', '2026-01']);
  assert.equal(monthEnd('2026-02'), '2026-02-28');
  assert.equal(previousMonthKey('2026-01'), '2025-12');
  assert.equal(todayISO(new Date(2026, 10, 9, 23, 59)), '2026-11-09');
});

test('dates : affichage en français', () => {
  assert.equal(formatDayMonth('2026-11-07'), '7 nov.');
  assert.equal(formatMonthYear('2026-11'), 'Novembre 2026');
  assert.equal(formatWeekdayDayMonth('2026-11-07'), 'Sam. 7 nov.');
});
