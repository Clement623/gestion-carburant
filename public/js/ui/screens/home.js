/** Écran d'accueil : consommation moyenne, dépenses du mois, dernier plein, derniers pleins. */

import { h } from '../../core/dom.js';
import { fuelLabel } from '../../domain/constants.js';
import { formatLongDate, formatMonthName, formatMonthShort, formatWeekdayDayMonth } from '../../domain/dates.js';
import {
  consumptionUnitLabel, consumptionValue, formatConsumptionNumber, formatEuro, formatKm, formatLiters,
  formatNumber, formatPricePerLiter, formatSigned, plural,
} from '../../domain/numbers.js';
import { rankReminders } from '../../domain/reminders.js';
import { barChart } from '../components/charts.js';
import { emptyState } from '../components/common.js';
import { icon } from '../components/icons.js';
import { backupFlow, demoFlow, restoreFlow } from '../flows.js';

const BACKUP_REMINDER_DAYS = 30;

export function renderHome(ctx) {
  const { app } = ctx;
  const vehicle = app.activeVehicle();
  if (!vehicle) return renderWelcome(ctx);

  const unit = app.unit();
  const dashboard = app.dashboard();
  const firstName = app.state.settings.firstName;

  return h('div', { class: 'stack' },
    h('header', { class: 'screen-header' },
      h('div', { class: 'stack-1' },
        h('p', { class: 'eyebrow' }, formatLongDate(app.today())),
        h('h1', { class: 'title', tabindex: '-1' }, firstName ? `Bonjour ${firstName}` : 'Bonjour')),
      h('a', { class: 'vehicle-chip', href: '#/vehicule' },
        icon('car', { size: 18 }),
        h('span', { class: 'vehicle-chip-text' }, `${vehicle.name} · ${fuelLabel(vehicle.fuelType)}`))),
    heroCard(dashboard, vehicle, unit),
    monthTiles(dashboard),
    alerts(ctx),
    lastFillupCard(dashboard.latest),
    recentCard(dashboard.recentSegments, unit));
}

function renderWelcome(ctx) {
  return h('div', { class: 'stack' },
    h('header', { class: 'screen-header' }, h('h1', { class: 'title', tabindex: '-1' }, 'Bienvenue')),
    h('section', { class: 'card-dark hero stack-2', 'aria-label': 'Présentation' },
      h('p', { class: 'hero-label' }, 'Suivi Carburant'),
      h('p', { class: 'welcome-lead' }, 'Notez vos pleins en quelques secondes et suivez votre consommation, vos dépenses et l’entretien de votre véhicule.')),
    h('section', { class: 'card stack-2' },
      h('h2', { class: 'card-title row-gap' }, icon('shield', { size: 20 }), 'Vos données restent chez vous'),
      h('p', { class: 'muted' }, 'Tout est enregistré sur cet appareil uniquement. Rien n’est envoyé sur Internet : ni compte, ni publicité, ni pistage.')),
    h('a', { class: 'btn btn-primary', href: '#/vehicule/nouveau' }, 'Ajouter mon véhicule'),
    h('button', { type: 'button', class: 'btn btn-secondary', on: { click: () => demoFlow(ctx) } }, 'Essayer la démonstration'),
    h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => restoreFlow(ctx) } }, 'Restaurer une sauvegarde'));
}

function heroCard(dashboard, vehicle, unit) {
  const { l100, label } = dashboard.consumption;
  const head = h('div', { class: 'hero-head' },
    h('h2', { class: 'hero-label' }, `Consommation moyenne · ${label}`),
    trendChip(dashboard, unit));

  if (l100 == null) {
    return h('section', { class: 'card-dark hero stack-2' },
      head,
      h('p', { class: 'hero-value' }, h('span', { class: 'hero-number' }, '—')),
      h('p', { class: 'hero-hint' }, 'Il faut deux pleins complets pour calculer la consommation. Notez chaque plein, le calcul se fera tout seul.'));
  }

  return h('section', { class: 'card-dark hero stack-3' },
    head,
    h('p', { class: 'hero-value' },
      h('span', { class: 'hero-number' }, formatConsumptionNumber(l100, unit)),
      h('span', { class: 'hero-unit' }, consumptionUnitLabel(unit))),
    gauge(l100, vehicle, unit));
}

function trendChip(dashboard, unit) {
  const current = consumptionValue(dashboard.currentMonth.l100, unit);
  const previous = consumptionValue(dashboard.previousMonth.l100, unit);
  if (current == null || previous == null) return null;
  const delta = current - previous;
  const better = unit === 'kml' ? delta >= 0 : delta <= 0;
  return h('span', { class: ['trend-chip', better ? 'trend-good' : 'trend-bad'] },
    `${formatSigned(delta)} vs ${formatMonthName(dashboard.previousMonth.key)}`);
}

function gauge(l100, vehicle, unit) {
  const target = vehicle.consumptionTarget;
  if (!target) {
    return h('a', { class: 'hero-link', href: `#/vehicule/${vehicle.id}` }, 'Fixer un objectif de consommation');
  }
  const scale = Math.max(10, Math.ceil(Math.max(l100, target) * 1.2));
  const onTarget = l100 <= target;
  return h('div', { class: 'gauge' },
    h('div', { class: 'gauge-track' },
      h('div', { class: ['gauge-fill', onTarget ? 'gauge-fill-good' : 'gauge-fill-over'], style: { width: `${Math.min(100, (l100 / scale) * 100)}%` } }),
      h('div', { class: 'gauge-target', style: { left: `${(target / scale) * 100}%` } })),
    h('div', { class: 'gauge-legend' },
      h('span', {}, unit === 'kml' ? '' : '0'),
      h('span', {}, `Objectif : ${formatConsumptionNumber(target, unit)} ${consumptionUnitLabel(unit, true)}`),
      h('span', {}, unit === 'kml' ? '' : formatNumber(scale))),
    h('p', { class: 'sr-only' }, onTarget ? 'Objectif atteint.' : 'Au-dessus de l’objectif.'));
}

function monthTiles(dashboard) {
  const { currentMonth, previousMonth, costPerKm, measuredDistance } = dashboard;
  const previousText = previousMonth.count > 0 ? ` · ${formatMonthShort(previousMonth.key)} ${formatEuro(previousMonth.totalCost)}` : '';
  return h('section', { class: 'grid-2', 'aria-label': 'Chiffres clés' },
    h('div', { class: 'card tile' },
      h('span', { class: 'tile-label' }, `Dépensé en ${formatMonthName(currentMonth.key)}`),
      h('span', { class: 'tile-value' }, formatEuro(currentMonth.totalCost)),
      h('span', { class: 'tile-sub' }, `${plural(currentMonth.count, 'plein')}${previousText}`)),
    h('div', { class: 'card tile' },
      h('span', { class: 'tile-label' }, 'Coût au kilomètre'),
      h('span', { class: 'tile-value' }, costPerKm == null ? '—' : formatEuro(costPerKm)),
      h('span', { class: 'tile-sub' }, costPerKm == null ? '2 pleins complets requis' : `sur ${formatKm(measuredDistance)}`)));
}

function alerts(ctx) {
  const { app } = ctx;
  const items = [];
  const urgent = rankReminders(app.state.reminders, { currentKm: app.currentOdometer(), today: app.today() })
    .filter(({ status }) => status.state !== 'ok');
  if (urgent.length > 0) {
    const [first] = urgent;
    items.push(h('a', { class: ['banner', first.status.state === 'overdue' ? 'banner-warn' : 'banner-info'], href: '#/vehicule' },
      icon('wrench', { size: 20 }),
      h('span', {},
        h('strong', {}, first.reminder.label),
        ` : ${first.status.dueLabel}`,
        urgent.length > 1 ? ` (+ ${plural(urgent.length - 1, 'autre')})` : '')));
  }

  const lastBackupAt = app.state.settings.lastBackupAt;
  const stale = !lastBackupAt || Date.now() - lastBackupAt > BACKUP_REMINDER_DAYS * 86_400_000;
  if (app.state.fillups.length >= 5 && stale) {
    items.push(h('div', { class: 'banner banner-info' },
      icon('shield', { size: 20 }),
      h('span', { class: 'banner-text' }, 'Vos données ne sont que sur cet appareil. Pensez à les sauvegarder.'),
      h('button', { type: 'button', class: 'banner-action', on: { click: () => backupFlow(ctx) } }, 'Sauvegarder')));
  }
  return items.length ? h('div', { class: 'stack-2' }, items) : null;
}

function lastFillupCard(latest) {
  if (!latest) {
    return emptyState({
      title: 'Aucun plein pour l’instant',
      text: 'Au prochain passage à la pompe, notez le kilométrage, les litres et le prix.',
      actions: [h('a', { class: 'btn btn-primary', href: '#/plein/nouveau' }, 'Ajouter mon premier plein')],
    });
  }
  const title = [formatWeekdayDayMonth(latest.date), latest.station].filter(Boolean).join(' · ');
  return h('section', { class: 'card stack-2', 'aria-labelledby': 'last-fillup-title' },
    h('div', { class: 'card-head' },
      h('h2', { id: 'last-fillup-title', class: 'card-title' }, 'Dernier plein'),
      h('a', { class: 'link-strong', href: '#/historique' }, 'Tout voir')),
    h('a', { class: 'fillup-summary', href: `#/plein/${latest.id}` },
      h('span', { class: 'icon-tile' }, icon('pump', { size: 22 })),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, title),
        h('span', { class: 'row-sub' }, `${formatLiters(latest.liters)} · ${formatPricePerLiter(latest.pricePerLiter)} · ${formatKm(latest.odometer)}`)),
      h('span', { class: 'amount' }, formatEuro(latest.totalCost))));
}

function recentCard(segments, unit) {
  if (segments.length === 0) return null;
  const values = segments.map((segment) => consumptionValue(segment.l100, unit));
  const label = consumptionUnitLabel(unit);
  return h('section', { class: 'card stack-3', 'aria-labelledby': 'recent-title' },
    h('div', { class: 'card-head' },
      h('h2', { id: 'recent-title', class: 'card-title' }, segments.length > 1 ? `${segments.length} derniers pleins` : 'Dernier plein complet'),
      h('span', { class: 'muted-small' }, label)),
    barChart({
      height: 70,
      className: 'home-bars',
      ariaLabel: `Consommation des derniers pleins en ${label} : ${values.map((value) => formatNumber(value, 1, 1)).join(', ')}.`,
      bars: values.map((value, index) => ({
        value,
        display: formatNumber(value, 1, 1),
        label: '',
        highlight: index === values.length - 1,
      })),
    }));
}
