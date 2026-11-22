/**
 * Formulaire « Nouveau plein » / « Modifier le plein ».
 * Le montant (ou le prix au litre) se calcule pendant la saisie, et un aperçu montre
 * la distance parcourue et la consommation que donnera ce plein.
 */

import { h } from '../../core/dom.js';
import { FUEL_TYPES, LIMITS } from '../../domain/constants.js';
import { previewFillup } from '../../domain/consumption.js';
import { formatDayMonth, isValidISODate } from '../../domain/dates.js';
import {
  formatConsumption, formatKm, parseDecimal, parseInteger, round, toInputDecimal, toInputFixed, toInputInteger,
} from '../../domain/numbers.js';
import { formHeader, notFound } from '../components/common.js';
import { confirmDialog } from '../components/dialog.js';
import { focusFirstInvalid, segmented, switchField, textField } from '../components/fields.js';

export function renderFillupForm(ctx) {
  const { app, params } = ctx;
  const vehicle = app.activeVehicle();
  if (!vehicle) {
    queueMicrotask(() => {
      ctx.toast('Ajoutez d’abord votre véhicule.');
      ctx.navigate('/vehicule/nouveau', { replace: true });
    });
    return document.createElement('div');
  }

  const editing = params.id ? app.findFillup(params.id) : null;
  if (params.id && !editing) return notFound('Ce plein est introuvable.');

  const today = app.today();
  const unit = app.unit();
  const others = app.state.fillups.filter((fillup) => fillup.id !== editing?.id);
  const latest = app.state.analysis.sorted.filter((fillup) => fillup.id !== editing?.id).at(-1) ?? null;
  let priceSource = 'price';

  const date = textField({ id: 'f-date', label: 'Date', type: 'date', value: editing?.date ?? today, max: today, required: true });
  const odometer = textField({
    id: 'f-km',
    label: 'Compteur (km)',
    inputmode: 'numeric',
    value: editing ? toInputInteger(editing.odometer) : '',
    hint: latest ? `Dernier relevé : ${formatKm(latest.odometer)} le ${formatDayMonth(latest.date)}` : 'Le kilométrage affiché au tableau de bord.',
    required: true,
  });
  const liters = textField({ id: 'f-liters', label: 'Litres', inputmode: 'decimal', value: editing ? toInputDecimal(editing.liters, 2) : '', placeholder: '0,00', required: true });
  const price = textField({
    id: 'f-price',
    label: 'Prix au litre (€)',
    inputmode: 'decimal',
    value: editing ? toInputFixed(editing.pricePerLiter, 3) : '',
    placeholder: latest ? toInputFixed(latest.pricePerLiter, 3) : '0,000',
  });
  const total = textField({
    id: 'f-total',
    label: 'Montant payé (€)',
    inputmode: 'decimal',
    value: editing ? toInputFixed(editing.totalCost, 2) : '',
    placeholder: '0,00',
    hint: 'Calculé à partir du prix au litre, ou saisissez directement le montant du ticket.',
    enterkeyhint: 'done',
  });
  const fuel = segmented({
    id: 'f-fuel',
    label: 'Carburant',
    columns: 3,
    value: editing?.fuelType ?? latest?.fuelType ?? vehicle.fuelType,
    options: FUEL_TYPES.map((type) => ({ value: type.id, label: type.short })),
  });
  const full = switchField({
    id: 'f-full',
    label: 'Plein complet',
    hint: 'Réservoir rempli jusqu’au déclic : nécessaire pour calculer la consommation exacte.',
    checked: editing?.isFull ?? true,
    onChange: updatePreview,
  });
  const station = textField({
    id: 'f-station',
    label: 'Station',
    optional: true,
    value: editing?.station ?? '',
    maxlength: LIMITS.stationMax,
    list: 'stations-list',
    placeholder: 'Nom ou adresse de la station',
    enterkeyhint: 'done',
  });
  const suggestions = h('datalist', { id: 'stations-list' }, app.stationSuggestions().map((name) => h('option', { value: name })));
  const preview = h('div', { class: 'card-dark preview', 'aria-live': 'polite' });

  // --- Calculs en direct ---------------------------------------------------------------

  function syncAmounts() {
    const quantity = parseDecimal(liters.input.value);
    const usable = Number.isFinite(quantity) && quantity > 0;
    if (priceSource === 'price') {
      const unitPrice = parseDecimal(price.input.value);
      total.input.value = usable && Number.isFinite(unitPrice) ? toInputFixed(round(quantity * unitPrice, 2), 2) : '';
    } else {
      const amount = parseDecimal(total.input.value);
      price.input.value = usable && Number.isFinite(amount) ? toInputFixed(round(amount / quantity, 3), 3) : '';
    }
  }

  function updatePreview() {
    const km = parseInteger(odometer.input.value);
    const quantity = parseDecimal(liters.input.value);
    const day = date.input.value;
    if (!Number.isInteger(km) || !isValidISODate(day)) {
      preview.replaceChildren(h('p', { class: 'preview-hint' }, latest
        ? 'Saisissez le kilométrage pour voir la distance parcourue et la consommation.'
        : 'Premier plein : il servira de point de départ au calcul de la consommation.'));
      return;
    }
    const info = previewFillup(others, {
      id: editing?.id ?? null,
      date: day,
      odometer: km,
      liters: Number.isFinite(quantity) ? quantity : 0,
      totalCost: 0,
      isFull: full.input.checked,
    });
    if (info.distance == null) {
      preview.replaceChildren(h('p', { class: 'preview-hint' }, 'Premier plein : il servira de point de départ au calcul de la consommation.'));
      return;
    }
    if (info.distance <= 0) {
      preview.replaceChildren(h('p', { class: 'preview-hint' }, 'Le kilométrage doit dépasser celui du plein précédent.'));
      return;
    }
    let right = '—';
    if (!full.input.checked) right = 'Plein partiel';
    else if (info.segment && Number.isFinite(quantity) && quantity > 0) right = formatConsumption(info.segment.l100, unit, true);
    preview.replaceChildren(
      h('span', { class: 'stack-1' },
        h('span', { class: 'preview-label' }, 'Depuis le plein précédent'),
        h('span', { class: 'preview-main' }, `${formatKm(info.distance)} parcourus`)),
      h('span', { class: 'preview-value' }, right));
  }

  liters.input.addEventListener('input', () => { liters.setError(null); syncAmounts(); updatePreview(); });
  price.input.addEventListener('input', () => { priceSource = 'price'; price.setError(null); total.setError(null); syncAmounts(); });
  total.input.addEventListener('input', () => { priceSource = 'total'; total.setError(null); price.setError(null); syncAmounts(); });
  odometer.input.addEventListener('input', () => { odometer.setError(null); updatePreview(); });
  date.input.addEventListener('input', () => { date.setError(null); updatePreview(); });
  updatePreview();

  // --- Enregistrement ------------------------------------------------------------------

  const fieldsByKey = { date, odometer, liters, pricePerLiter: price, totalCost: total, fuelType: fuel, station };
  const submitButton = h('button', { type: 'submit', class: 'btn btn-primary' }, editing ? 'Enregistrer les modifications' : 'Enregistrer le plein');
  let busy = false;

  async function submit() {
    if (busy) return;
    const check = app.checkFillup({
      date: date.input.value,
      odometer: odometer.input.value,
      liters: liters.input.value,
      pricePerLiter: price.input.value,
      totalCost: total.input.value,
      priceSource,
      fuelType: fuel.value,
      isFull: full.input.checked,
      station: station.input.value,
    }, editing?.id ?? null);
    for (const [key, field] of Object.entries(fieldsByKey)) field.setError(check.errors[key]);
    if (!check.ok) {
      focusFirstInvalid(form);
      return;
    }
    if (check.warnings.length > 0) {
      const confirmed = await confirmDialog({
        title: 'Vérifiez la saisie',
        message: 'Certaines valeurs semblent inhabituelles :',
        details: check.warnings,
        confirmLabel: 'Enregistrer quand même',
        cancelLabel: 'Corriger',
      });
      if (!confirmed) return;
    }
    busy = true;
    submitButton.disabled = true;
    try {
      await app.saveFillup(check.value, editing?.id ?? null);
      ctx.onFirstSave();
      ctx.toast(editing ? 'Plein modifié.' : 'Plein enregistré.');
      ctx.navigate('/historique');
    } catch (error) {
      console.error(error);
      ctx.toast(`Enregistrement impossible : ${error.message}`, { tone: 'error' });
    } finally {
      busy = false;
      submitButton.disabled = false;
    }
  }

  async function remove() {
    const confirmed = await confirmDialog({
      title: 'Supprimer ce plein ?',
      message: 'Les statistiques seront recalculées sans lui. Cette action est définitive.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!confirmed) return;
    await app.deleteFillup(editing.id);
    ctx.toast('Plein supprimé.');
    ctx.navigate('/historique');
  }

  const form = h('form', { class: 'stack form', novalidate: true, on: { submit: (event) => { event.preventDefault(); submit(); } } },
    h('div', { class: 'grid-2' }, date.root, odometer.root),
    h('div', { class: 'grid-2' }, liters.root, price.root),
    total.root,
    preview, // l'aperçu suit directement les chiffres saisis
    fuel.root,
    full.root,
    station.root,
    suggestions,
    h('div', { class: 'form-actions' },
      submitButton,
      editing && h('button', { type: 'button', class: 'btn btn-danger-ghost', on: { click: remove } }, 'Supprimer ce plein')));

  return h('div', { class: 'stack' }, formHeader(editing ? 'Modifier le plein' : 'Nouveau plein', ctx.backPath()), form);
}
