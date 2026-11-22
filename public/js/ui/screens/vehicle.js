/** Écran Véhicule : fiche du véhicule, rappels d'entretien, préférences, données et confidentialité. */

import { h } from '../../core/dom.js';
import { APP_VERSION, fuelLabel } from '../../domain/constants.js';
import { formatFullDate, todayISO } from '../../domain/dates.js';
import { formatKm, formatNumber, round } from '../../domain/numbers.js';
import { rankReminders } from '../../domain/reminders.js';
import { actionRow, emptyState, screenHeader } from '../components/common.js';
import { segmented, textField } from '../components/fields.js';
import { icon } from '../components/icons.js';
import { backupFlow, clearFlow, csvFlow, demoFlow, restoreFlow } from '../flows.js';

export function renderVehicle(ctx) {
  const { app } = ctx;
  const addButton = h('a', { class: 'btn-pill', href: '#/vehicule/nouveau' }, icon('plus', { size: 16, strokeWidth: 2.2 }), 'Ajouter');
  const vehicle = app.activeVehicle();

  const sections = vehicle
    ? [vehicleCard(ctx, vehicle), otherVehicles(ctx), remindersSection(ctx), preferencesSection(ctx)]
    : [emptyState({
      title: 'Aucun véhicule',
      text: 'Ajoutez votre véhicule pour commencer.',
      actions: [h('a', { class: 'btn btn-primary', href: '#/vehicule/nouveau' }, 'Ajouter mon véhicule')],
    })];

  return h('div', { class: 'stack' },
    screenHeader('Véhicule', addButton),
    sections,
    installSection(ctx),
    dataSection(ctx),
    h('p', { class: 'about' }, `Suivi Carburant ${APP_VERSION} · aucune donnée n’est envoyée sur Internet.`));
}

function vehicleCard(ctx, vehicle) {
  const { app } = ctx;
  const odometer = app.currentOdometer();
  const l100 = app.dashboard().consumption.l100;
  const range = vehicle.tankCapacity && l100 ? round((vehicle.tankCapacity / l100) * 100, -1) : null;

  return h('section', { class: 'card-dark vehicle-card stack-3', 'aria-label': 'Véhicule actif' },
    h('div', { class: 'vehicle-top' },
      h('span', { class: 'icon-tile icon-tile-dark' }, icon('car', { size: 28, strokeWidth: 1.6 })),
      h('span', { class: 'row-main' },
        h('span', { class: 'vehicle-name' }, vehicle.name),
        (vehicle.model || vehicle.plate) && h('span', { class: 'vehicle-sub' },
          vehicle.model,
          vehicle.model && vehicle.plate ? ' · ' : '',
          vehicle.plate && h('span', { class: 'nowrap' }, vehicle.plate)))),
    h('dl', { class: 'vehicle-specs' },
      spec('Carburant', fuelLabel(vehicle.fuelType)),
      spec('Réservoir', vehicle.tankCapacity ? `${formatNumber(vehicle.tankCapacity, 0, 1)} L` : '—'),
      spec('Compteur', odometer == null ? '—' : formatKm(odometer))),
    h('div', { class: 'range-box' },
      h('span', { class: 'range-label' }, 'Autonomie estimée avec un plein'),
      h('span', { class: 'range-value' }, range ? `≈ ${formatKm(range)}` : '—')),
    !vehicle.tankCapacity && h('p', { class: 'hero-hint' }, 'Indiquez la capacité du réservoir pour estimer l’autonomie.'),
    h('div', { class: 'vehicle-actions' },
      h('a', { class: 'btn-pill btn-pill-dark', href: `#/vehicule/${vehicle.id}` }, 'Modifier le véhicule')));
}

function spec(label, value) {
  return h('div', { class: 'spec' }, h('dt', {}, label), h('dd', {}, value));
}

function otherVehicles(ctx) {
  const { app } = ctx;
  const others = app.state.vehicles.filter((vehicle) => vehicle.id !== app.state.activeVehicleId);
  if (others.length === 0) return null;
  return h('section', { class: 'stack-2', 'aria-labelledby': 'others-title' },
    h('h2', { id: 'others-title', class: 'section-title' }, 'Mes autres véhicules'),
    h('div', { class: 'list' }, others.map((vehicle) => actionRow({
      iconName: 'car',
      label: vehicle.name,
      detail: 'Utiliser ce véhicule',
      focusKey: `vehicle-${vehicle.id}`,
      onClick: async () => {
        await app.setActiveVehicle(vehicle.id);
        ctx.toast(`${vehicle.name} est maintenant le véhicule actif.`);
        ctx.rerender();
      },
    }))));
}

function remindersSection(ctx) {
  const { app } = ctx;
  const ranked = rankReminders(app.state.reminders, { currentKm: app.currentOdometer(), today: app.today() });
  const rows = ranked.map(({ reminder, status }) => h('a', { class: 'reminder-row', href: `#/rappel/${reminder.id}` },
    h('span', { class: 'reminder-head' },
      h('span', { class: 'row-title' }, reminder.label),
      h('span', { class: ['reminder-due', `due-${status.state}`] }, status.dueLabel)),
    h('span', { class: 'progress', role: 'presentation' },
      h('span', { class: ['progress-fill', `progress-${status.state}`], style: { width: `${Math.round(status.progress * 100)}%` } }))));

  return h('section', { class: 'stack-2', 'aria-labelledby': 'reminders-title' },
    h('div', { class: 'section-head' },
      h('h2', { id: 'reminders-title', class: 'section-title' }, 'Rappels d’entretien'),
      h('a', { class: 'link-strong', href: '#/rappel/nouveau' }, 'Ajouter')),
    rows.length > 0
      ? h('div', { class: 'list' }, rows)
      : h('p', { class: 'card muted' }, 'Aucun rappel. Ajoutez la vidange ou le contrôle technique pour ne rien oublier.'));
}

function preferencesSection(ctx) {
  const { app } = ctx;
  const firstName = textField({
    id: 'pref-name',
    label: 'Votre prénom',
    optional: true,
    value: app.state.settings.firstName ?? '',
    maxlength: 30,
    autocomplete: 'given-name',
    enterkeyhint: 'done',
  });
  firstName.input.addEventListener('change', async () => {
    await app.setFirstName(firstName.input.value);
    ctx.toast('Prénom enregistré.');
  });
  const unit = segmented({
    id: 'pref-unit',
    label: 'Afficher la consommation en',
    value: app.unit(),
    options: [{ value: 'l100', label: 'L/100 km' }, { value: 'kml', label: 'km/L' }],
    onChange: async (value) => {
      await app.setUnit(value);
      ctx.rerender();
    },
  });
  return h('section', { class: 'stack-2', 'aria-labelledby': 'prefs-title' },
    h('h2', { id: 'prefs-title', class: 'section-title' }, 'Préférences'),
    h('div', { class: 'card stack-3' }, firstName.root, unit.root));
}

function installSection(ctx) {
  const { install } = ctx;
  if (install.isInstalled()) return null;
  if (install.canPrompt()) {
    return h('section', { class: 'card stack-2' },
      h('h2', { class: 'card-title row-gap' }, icon('install', { size: 20 }), 'Installer l’application'),
      h('p', { class: 'muted' }, 'Ajoutez Suivi Carburant à votre écran d’accueil : il s’ouvrira comme une appli, même sans réseau.'),
      h('button', { type: 'button', class: 'btn btn-secondary', on: { click: async () => { await install.prompt(); ctx.rerender(); } } }, 'Installer'));
  }
  if (install.isIos()) {
    return h('section', { class: 'card stack-2' },
      h('h2', { class: 'card-title row-gap' }, icon('install', { size: 20 }), 'Installer sur iPhone'),
      h('p', { class: 'muted' }, 'Dans Safari, touchez le bouton Partager puis « Sur l’écran d’accueil ».'));
  }
  return null;
}

function dataSection(ctx) {
  const { app } = ctx;
  const lastBackupAt = app.state.settings.lastBackupAt;
  const lastBackup = lastBackupAt ? `Dernière sauvegarde : ${formatFullDate(todayISO(new Date(lastBackupAt)))}` : 'Aucune sauvegarde pour l’instant';
  const storage = h('span', {}, 'Vérification du stockage…');
  ctx.storageStatus().then((status) => {
    storage.textContent = status;
  });
  const hasData = app.state.vehicles.length > 0;

  return h('section', { class: 'stack-2', 'aria-labelledby': 'data-title' },
    h('h2', { id: 'data-title', class: 'section-title' }, 'Données et confidentialité'),
    h('div', { class: 'card stack-2 privacy-note' },
      h('p', { class: 'row-gap' }, icon('shield', { size: 20 }), h('strong', {}, 'Vos données restent sur cet appareil.')),
      h('p', { class: 'muted' }, 'Elles sont enregistrées dans ce navigateur uniquement. Faites des sauvegardes régulières : si vous effacez les données du navigateur ou changez de téléphone, elles seront perdues.'),
      h('p', { class: 'muted-small' }, lastBackup, ' · ', storage)),
    h('div', { class: 'list' },
      hasData && actionRow({ iconName: 'download', label: 'Sauvegarder', detail: 'Fichier JSON à garder en lieu sûr', onClick: () => backupFlow(ctx), focusKey: 'data-backup' }),
      hasData && actionRow({ iconName: 'lock', label: 'Sauvegarder avec un mot de passe', detail: 'Fichier chiffré (AES-256)', onClick: () => backupFlow(ctx, { encrypted: true }), focusKey: 'data-backup-enc' }),
      actionRow({ iconName: 'upload', label: 'Restaurer une sauvegarde', detail: 'Remplace les données de cet appareil', onClick: () => restoreFlow(ctx), focusKey: 'data-restore' }),
      hasData && actionRow({ iconName: 'table', label: 'Exporter en CSV', detail: 'Pour Excel, LibreOffice ou Google Sheets', onClick: () => csvFlow(ctx), focusKey: 'data-csv' }),
      actionRow({ iconName: 'play', label: 'Charger les données de démonstration', onClick: () => demoFlow(ctx), focusKey: 'data-demo' }),
      hasData && actionRow({ iconName: 'trash', label: 'Effacer toutes les données', danger: true, onClick: () => clearFlow(ctx), focusKey: 'data-clear' })));
}
