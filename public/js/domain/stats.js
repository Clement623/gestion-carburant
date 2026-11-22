/**
 * Statistiques dérivées des pleins et des segments (voir consumption.js).
 * Fonctions pures : mêmes entrées, mêmes sorties, aucun accès au stockage ni à l'écran.
 */

import { sortFillups } from './consumption.js';
import { addMonths, lastMonthKeys, monthEnd, monthKey, monthStart, previousMonthKey } from './dates.js';

const ALL_TIME = Object.freeze(['0000-01-01', '9999-12-31']);
const inRange = (iso, from, to) => iso >= from && iso <= to;

/**
 * Totaux sur une période [from, to] (dates ISO incluses).
 * - dépenses, litres et nombre de pleins : pleins datés dans la période ;
 * - distance : écarts de compteur entre pleins consécutifs, attribués au plein le plus récent ;
 * - consommation et coût au km : segments de plein à plein qui se terminent dans la période.
 */
export function summarize(fillups, segments, from, to) {
  let count = 0;
  let totalCost = 0;
  let totalLiters = 0;
  let distance = 0;
  let previous = null;
  for (const fillup of sortFillups(fillups)) {
    if (inRange(fillup.date, from, to)) {
      count += 1;
      totalCost += fillup.totalCost;
      totalLiters += fillup.liters;
      if (previous) distance += fillup.odometer - previous.odometer;
    }
    previous = fillup;
  }

  let segmentLiters = 0;
  let segmentDistance = 0;
  let segmentCost = 0;
  for (const segment of segments) {
    if (!inRange(segment.endDate, from, to)) continue;
    segmentLiters += segment.liters;
    segmentDistance += segment.distance;
    segmentCost += segment.cost;
  }

  return {
    count,
    totalCost,
    totalLiters,
    distance,
    avgPrice: totalLiters > 0 ? totalCost / totalLiters : null,
    l100: segmentDistance > 0 ? (segmentLiters / segmentDistance) * 100 : null,
    costPerKm: segmentDistance > 0 ? segmentCost / segmentDistance : null,
    measuredDistance: segmentDistance,
  };
}

/** Une ligne de totaux par mois, dans l'ordre des clés reçues (« 2026-06 », « 2026-07 »…). */
export function monthlySeries(fillups, segments, keys) {
  return keys.map((key) => ({ key, ...summarize(fillups, segments, monthStart(key), monthEnd(key)) }));
}

/** Totaux des `months` derniers mois (mois en cours inclus) jusqu'à aujourd'hui. */
export function periodSummary(fillups, segments, months, today) {
  const keys = lastMonthKeys(months, today);
  return { keys, totals: summarize(fillups, segments, monthStart(keys[0]), today) };
}

/** Tout ce qu'affiche l'écran d'accueil. */
export function buildDashboard(fillups, segments, today, months = 3) {
  const current = monthKey(today);
  const previous = previousMonthKey(current);
  const from = monthStart(monthKey(addMonths(monthStart(current), -(months - 1))));

  let period = summarize(fillups, segments, from, today);
  let periodLabel = `${months} mois`;
  if (period.l100 == null && segments.length > 0) {
    // Aucun segment récent : on se rabat sur l'historique complet plutôt que d'afficher un tiret.
    period = summarize(fillups, segments, ...ALL_TIME);
    periodLabel = 'depuis le début';
  }

  return {
    consumption: { l100: period.l100, label: periodLabel },
    costPerKm: period.costPerKm,
    measuredDistance: period.measuredDistance,
    currentMonth: { key: current, ...summarize(fillups, segments, monthStart(current), monthEnd(current)) },
    previousMonth: { key: previous, ...summarize(fillups, segments, monthStart(previous), monthEnd(previous)) },
    recentSegments: segments.slice(-6),
    latest: sortFillups(fillups).at(-1) ?? null,
  };
}
