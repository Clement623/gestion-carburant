/** Historique des pleins, groupés par mois, avec filtre de période et export CSV. */

import { h } from '../../core/dom.js';
import { fuelLabel } from '../../domain/constants.js';
import { averageConsumption } from '../../domain/consumption.js';
import { dayOfMonth, formatMonthYear, formatWeekdayShort, lastMonthKeys, monthKey, monthStart } from '../../domain/dates.js';
import { formatConsumption, formatEuro, formatKm, formatLiters, formatPricePerLiter } from '../../domain/numbers.js';
import { emptyState, screenHeader } from '../components/common.js';
import { icon } from '../components/icons.js';
import { csvFlow } from '../flows.js';

let period = 'all'; // conservé tant que l'appli reste ouverte

export function renderHistory(ctx) {
  const { app } = ctx;
  const exportButton = h('button', {
    type: 'button',
    class: 'icon-btn',
    'aria-label': 'Exporter en CSV pour un tableur',
    title: 'Exporter en CSV',
    on: { click: () => csvFlow(ctx) },
  }, icon('download', { size: 20 }));
  const header = screenHeader('Historique', exportButton);

  const vehicle = app.activeVehicle();
  if (!vehicle) {
    return h('div', { class: 'stack' }, header, emptyState({
      title: 'Aucun véhicule',
      text: 'Ajoutez votre véhicule pour commencer à noter vos pleins.',
      actions: [h('a', { class: 'btn btn-primary', href: '#/vehicule/nouveau' }, 'Ajouter mon véhicule')],
    }));
  }

  const today = app.today();
  const year = today.slice(0, 4);
  const ranges = {
    all: ['0000-01-01', '9999-12-31'],
    month: [monthStart(monthKey(today)), today],
    quarter: [monthStart(lastMonthKeys(3, today)[0]), today],
    year: [`${year}-01-01`, `${year}-12-31`],
  };
  const chips = [['all', 'Tout'], ['month', 'Ce mois'], ['quarter', '3 mois'], ['year', year]];
  const chipRow = h('div', { class: 'chips', role: 'group', 'aria-label': 'Période affichée' },
    chips.map(([value, label]) => h('button', {
      type: 'button',
      class: 'chip',
      'aria-pressed': String(period === value),
      dataset: { focusKey: `period-${value}` },
      on: { click: () => { period = value; ctx.rerender(); } },
    }, label)));

  const { sorted, info, segments } = app.state.analysis;
  const [from, to] = ranges[period];
  const visible = [...sorted].reverse().filter((fillup) => fillup.date >= from && fillup.date <= to);

  if (sorted.length === 0) {
    return h('div', { class: 'stack' }, header, emptyState({
      title: 'Aucun plein enregistré',
      text: 'Vos pleins apparaîtront ici, du plus récent au plus ancien.',
      actions: [h('a', { class: 'btn btn-primary', href: '#/plein/nouveau' }, 'Ajouter un plein')],
    }));
  }

  // Repère pour colorer les consommations : l'objectif du véhicule, sinon la moyenne.
  const reference = vehicle.consumptionTarget ?? averageConsumption(segments);
  const referenceName = vehicle.consumptionTarget ? 'l’objectif' : 'la moyenne';
  const unit = app.unit();

  const groups = new Map();
  for (const fillup of visible) {
    const key = monthKey(fillup.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fillup);
  }

  const sections = [...groups].map(([key, items]) => h('section', { class: 'month-group', 'aria-labelledby': `month-${key}` },
    h('div', { class: 'month-head' },
      h('h2', { id: `month-${key}`, class: 'month-title' }, formatMonthYear(key)),
      h('span', { class: 'month-total' }, formatEuro(items.reduce((sum, item) => sum + item.totalCost, 0)))),
    h('ul', { class: 'list', role: 'list' },
      items.map((fillup) => h('li', {}, fillupRow(fillup, info.get(fillup.id), { unit, reference, referenceName }))))));

  return h('div', { class: 'stack' },
    header,
    chipRow,
    sections.length > 0 ? sections : emptyState({ title: 'Aucun plein sur cette période', text: 'Choisissez une autre période ou « Tout ».' }));
}

function fillupRow(fillup, details, { unit, reference, referenceName }) {
  let badge = null;
  if (!fillup.isFull) {
    badge = h('span', { class: 'badge badge-neutral' }, 'Partiel');
  } else if (details?.segment) {
    const good = reference == null || details.segment.l100 <= reference;
    badge = h('span', { class: ['badge', good ? 'badge-good' : 'badge-warn'] },
      formatConsumption(details.segment.l100, unit, true),
      h('span', { class: 'sr-only' }, good ? ` (sous ${referenceName})` : ` (au-dessus de ${referenceName})`));
  }
  const subtitle = [formatKm(fillup.odometer), fuelLabel(fillup.fuelType), fillup.station].filter(Boolean).join(' · ');
  return h('a', { class: 'fillup-row', href: `#/plein/${fillup.id}` },
    h('span', { class: 'fillup-day' },
      h('span', { class: 'fillup-day-num' }, dayOfMonth(fillup.date)),
      h('span', { class: 'fillup-day-name' }, formatWeekdayShort(fillup.date))),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, `${formatLiters(fillup.liters)} · ${formatPricePerLiter(fillup.pricePerLiter)}`),
      h('span', { class: 'row-sub' }, subtitle)),
    h('span', { class: 'fillup-side' },
      h('span', { class: 'amount' }, formatEuro(fillup.totalCost)),
      badge));
}
