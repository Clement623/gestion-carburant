/** Statistiques sur 6 mois ou 1 an : totaux, courbe de consommation, dépenses par mois. */

import { h } from '../../core/dom.js';
import { formatMonthNarrow, formatMonthShort, formatMonthYear } from '../../domain/dates.js';
import {
  consumptionUnitLabel, consumptionValue, formatConsumptionNumber, formatEuro, formatKm, formatNumber, formatPricePerLiter, formatVolume,
} from '../../domain/numbers.js';
import { monthlySeries, periodSummary } from '../../domain/stats.js';
import { barChart, lineChart } from '../components/charts.js';
import { emptyState, screenHeader } from '../components/common.js';

let months = 6;

export function renderStats(ctx) {
  const { app } = ctx;
  const toggle = h('div', { class: 'toggle', role: 'group', 'aria-label': 'Période' },
    [[6, '6 mois'], [12, '1 an']].map(([value, label]) => h('button', {
      type: 'button',
      class: 'toggle-btn',
      'aria-pressed': String(months === value),
      dataset: { focusKey: `months-${value}` },
      on: { click: () => { months = value; ctx.rerender(); } },
    }, label)));
  const header = screenHeader('Statistiques', toggle);

  const vehicle = app.activeVehicle();
  const { sorted, segments } = app.state.analysis;
  if (!vehicle || sorted.length === 0) {
    return h('div', { class: 'stack' }, header, emptyState({
      title: 'Pas encore de statistiques',
      text: 'Elles apparaîtront dès vos premiers pleins.',
      actions: [h('a', { class: 'btn btn-primary', href: vehicle ? '#/plein/nouveau' : '#/vehicule/nouveau' }, vehicle ? 'Ajouter un plein' : 'Ajouter mon véhicule')],
    }));
  }

  const unit = app.unit();
  const unitLabel = consumptionUnitLabel(unit);
  const today = app.today();
  const { keys, totals } = periodSummary(sorted, segments, months, today);
  const series = monthlySeries(sorted, segments, keys);
  const monthLabel = months > 6 ? formatMonthNarrow : formatMonthShort;
  const target = consumptionValue(vehicle.consumptionTarget, unit);
  const hasConsumption = series.some((month) => month.l100 != null);

  const consumptionCard = h('section', { class: 'card stack-2', 'aria-labelledby': 'conso-title' },
    h('div', { class: 'card-head' },
      h('h2', { id: 'conso-title', class: 'card-title' }, 'Consommation'),
      h('span', { class: 'muted-small' }, totals.l100 == null ? unitLabel : `${unitLabel} · moy. ${formatConsumptionNumber(totals.l100, unit)}`)),
    hasConsumption
      ? lineChart({
        points: series.map((month) => ({ label: monthLabel(month.key), value: consumptionValue(month.l100, unit) })),
        target,
        targetLabel: target == null ? '' : `Objectif : ${formatNumber(target, 1, 1)} ${unitLabel}`,
        format: (value) => formatNumber(value, 1, 1),
        ariaLabel: `Consommation par mois en ${unitLabel} : ${series.map((month) => `${formatMonthYear(month.key)} ${month.l100 == null ? 'pas de mesure' : formatConsumptionNumber(month.l100, unit)}`).join(' ; ')}.${target == null ? '' : ` Objectif : ${formatNumber(target, 1, 1)}.`}`,
      })
      : h('p', { class: 'muted' }, 'Pas assez de pleins complets sur la période pour tracer la courbe.'));

  const spendingCard = h('section', { class: 'card stack-2', 'aria-labelledby': 'spend-title' },
    h('div', { class: 'card-head' },
      h('h2', { id: 'spend-title', class: 'card-title' }, 'Dépenses'),
      h('span', { class: 'muted-small' }, '€ par mois')),
    barChart({
      height: 100,
      ariaLabel: `Dépenses par mois : ${series.map((month) => `${formatMonthYear(month.key)} ${formatEuro(month.totalCost)}`).join(' ; ')}.`,
      bars: series.map((month, index) => ({
        value: month.totalCost,
        display: formatNumber(month.totalCost, 0),
        label: index === series.length - 1 ? `${monthLabel(month.key)}*` : monthLabel(month.key),
        pending: index === series.length - 1,
      })),
    }),
    h('p', { class: 'muted-small' }, '* mois en cours'));

  return h('div', { class: 'stack' },
    header,
    h('section', { class: 'grid-2', 'aria-label': `Totaux sur ${months === 12 ? 'un an' : '6 mois'}` },
      h('div', { class: 'card-dark tile' },
        h('span', { class: 'tile-label' }, 'Total dépensé'),
        h('span', { class: 'tile-value' }, formatEuro(totals.totalCost))),
      h('div', { class: 'card tile' },
        h('span', { class: 'tile-label' }, 'Distance'),
        h('span', { class: 'tile-value' }, formatKm(totals.distance))),
      h('div', { class: 'card tile' },
        h('span', { class: 'tile-label' }, 'Carburant'),
        h('span', { class: 'tile-value' }, formatVolume(totals.totalLiters))),
      h('div', { class: 'card tile' },
        h('span', { class: 'tile-label' }, 'Prix moyen'),
        h('span', { class: 'tile-value' }, formatPricePerLiter(totals.avgPrice)))),
    consumptionCard,
    spendingCard);
}
