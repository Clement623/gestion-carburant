import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSegments, analyzeFillups, previewFillup, averageConsumption } from '../../public/js/domain/consumption.js';
import { summarize, monthlySeries, buildDashboard } from '../../public/js/domain/stats.js';

let counter = 0;
const fillup = (date, odometer, liters, pricePerLiter, isFull = true) => ({
  id: `f${++counter}`,
  date,
  odometer,
  liters,
  pricePerLiter,
  totalCost: Math.round(liters * pricePerLiter * 100) / 100,
  isFull,
  fuelType: 'E10',
});

// Mêmes chiffres que la maquette : 142,80 € en octobre, 66,81 € le 7 novembre.
const history = [
  fillup('2026-09-12', 45868, 37.8, 1.779),
  fillup('2026-09-26', 46485, 40.1, 1.789),
  fillup('2026-10-10', 47112, 39.5, 1.779),
  fillup('2026-10-24', 47724, 41.0, 1.769),
  fillup('2026-11-07', 48320, 38.2, 1.749),
];

test('un segment relie deux pleins complets consécutifs', () => {
  const segments = computeSegments(history);
  assert.equal(segments.length, 4);
  const last = segments.at(-1);
  assert.equal(last.distance, 596);
  assert.equal(last.liters, 38.2);
  assert.ok(Math.abs(last.l100 - 6.409) < 0.001);
});

test('les pleins partiels sont reportés sur le plein complet suivant', () => {
  const list = [
    fillup('2026-01-01', 10000, 40, 1.8),
    fillup('2026-01-08', 10300, 10, 1.8, false),
    fillup('2026-01-15', 10600, 26, 1.8),
  ];
  const segments = computeSegments(list);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].liters, 36);
  assert.equal(segments[0].distance, 600);
  assert.equal(segments[0].l100, 6);
  assert.equal(segments[0].fillupCount, 2);
});

test('les pleins avant le premier plein complet ne comptent pas, l’ordre d’entrée non plus', () => {
  const list = [
    fillup('2026-01-15', 10600, 30, 1.8),
    fillup('2026-01-01', 10000, 12, 1.8, false),
    fillup('2026-01-08', 10200, 40, 1.8),
  ];
  const segments = computeSegments(list);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].distance, 400);
  assert.equal(segments[0].l100, 7.5);
});

test('analyzeFillups donne la distance depuis le plein précédent', () => {
  const { info, sorted } = analyzeFillups(history);
  assert.equal(info.get(sorted[0].id).distance, null);
  assert.equal(info.get(sorted.at(-1).id).distance, 596);
  assert.ok(info.get(sorted.at(-1).id).segment);
});

test('previewFillup calcule la consommation d’un plein en cours de saisie', () => {
  const preview = previewFillup(history, { id: null, date: '2026-11-20', odometer: 48916, liters: 37.6, totalCost: 0, isFull: true });
  assert.equal(preview.distance, 596);
  assert.ok(Math.abs(preview.segment.l100 - 6.309) < 0.001);
});

test('summarize : octobre = 142,80 € pour deux pleins', () => {
  const segments = computeSegments(history);
  const october = summarize(history, segments, '2026-10-01', '2026-10-31');
  assert.equal(october.count, 2);
  assert.equal(Math.round(october.totalCost * 100) / 100, 142.8);
  assert.equal(october.distance, 627 + 612);
  assert.ok(october.l100 > 6 && october.l100 < 7);
});

test('monthlySeries renvoie un mois vide quand il n’y a aucun plein', () => {
  const segments = computeSegments(history);
  const series = monthlySeries(history, segments, ['2026-08', '2026-09']);
  assert.equal(series[0].count, 0);
  assert.equal(series[0].l100, null);
  assert.equal(series[1].count, 2);
});

test('buildDashboard rassemble les chiffres de l’accueil', () => {
  const segments = computeSegments(history);
  const dash = buildDashboard(history, segments, '2026-11-09');
  assert.equal(dash.currentMonth.key, '2026-11');
  assert.equal(dash.currentMonth.count, 1);
  assert.equal(dash.currentMonth.totalCost, 66.81);
  assert.equal(dash.previousMonth.key, '2026-10');
  assert.equal(dash.latest.odometer, 48320);
  assert.equal(dash.consumption.label, '3 mois');
  assert.ok(dash.costPerKm > 0.1 && dash.costPerKm < 0.13);
  assert.equal(dash.recentSegments.length, 4);
  assert.ok(Math.abs(averageConsumption(segments) - dash.consumption.l100) < 0.2);
});

test('buildDashboard se rabat sur tout l’historique si aucun segment récent', () => {
  const old = history.map((f) => ({ ...f, date: f.date.replace('2026', '2024') }));
  const dash = buildDashboard(old, computeSegments(old), '2026-11-09');
  assert.equal(dash.consumption.label, 'depuis le début');
  assert.ok(dash.consumption.l100 > 6);
});
