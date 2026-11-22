/** Formulaire de rappel d'entretien (au kilométrage ou à une date). */

import { h } from '../../core/dom.js';
import { LIMITS } from '../../domain/constants.js';
import { addMonths } from '../../domain/dates.js';
import { toInputInteger } from '../../domain/numbers.js';
import { REMINDER_PRESETS, canComplete } from '../../domain/reminders.js';
import { formHeader, notFound } from '../components/common.js';
import { confirmDialog } from '../components/dialog.js';
import { focusFirstInvalid, segmented, textField } from '../components/fields.js';

export function renderReminderForm(ctx) {
  const { app, params } = ctx;
  if (!app.activeVehicle()) {
    queueMicrotask(() => ctx.navigate('/vehicule/nouveau', { replace: true }));
    return document.createElement('div');
  }
  const editing = params.id ? app.findReminder(params.id) : null;
  if (params.id && !editing) return notFound('Ce rappel est introuvable.');

  const today = app.today();
  const odometer = app.currentOdometer();

  const label = textField({ id: 'r-label', label: 'Nom du rappel', value: editing?.label ?? '', placeholder: 'Vidange', maxlength: LIMITS.labelMax, autocapitalize: 'sentences' });
  const kind = segmented({
    id: 'r-kind',
    label: 'Échéance',
    value: editing?.kind ?? 'km',
    options: [{ value: 'km', label: 'Au kilométrage' }, { value: 'date', label: 'À une date' }],
    onChange: showKind,
  });
  const intervalKm = textField({ id: 'r-interval-km', label: 'Tous les (km)', inputmode: 'numeric', value: editing?.intervalKm ? toInputInteger(editing.intervalKm) : '15000' });
  const lastKm = textField({
    id: 'r-last-km',
    label: 'Dernier entretien à (km)',
    inputmode: 'numeric',
    value: toInputInteger(editing?.lastKm ?? odometer),
    hint: odometer == null ? null : 'Par défaut, le kilométrage actuel.',
  });
  const dueDate = textField({ id: 'r-due', label: 'Date d’échéance', type: 'date', value: editing?.dueDate ?? addMonths(today, 12) });
  const intervalMonths = textField({
    id: 'r-interval-months',
    label: 'Répéter tous les (mois)',
    optional: true,
    inputmode: 'numeric',
    value: editing?.intervalMonths ? String(editing.intervalMonths) : '',
    hint: 'Laissez vide pour un rappel unique.',
  });
  const kmGroup = h('div', { class: 'grid-2' }, intervalKm.root, lastKm.root);
  const dateGroup = h('div', { class: 'grid-2' }, dueDate.root, intervalMonths.root);

  function showKind(value) {
    kmGroup.hidden = value !== 'km';
    dateGroup.hidden = value !== 'date';
  }
  showKind(kind.value);

  const presets = editing ? null : h('div', { class: 'stack-1' },
    h('p', { class: 'field-label' }, 'Suggestions'),
    h('div', { class: 'chips' }, REMINDER_PRESETS.map((preset) => h('button', {
      type: 'button',
      class: 'chip',
      on: {
        click: () => {
          label.input.value = preset.label;
          kind.select(preset.kind);
          showKind(preset.kind);
          if (preset.kind === 'km') intervalKm.input.value = String(preset.intervalKm);
          else {
            intervalMonths.input.value = String(preset.intervalMonths);
            dueDate.input.value = addMonths(today, preset.intervalMonths);
          }
        },
      },
    }, preset.label))));

  const fieldsByKey = { label, kind, intervalKm, lastKm, dueDate, intervalMonths };
  const submitButton = h('button', { type: 'submit', class: 'btn btn-primary' }, editing ? 'Enregistrer' : 'Ajouter le rappel');

  async function submit() {
    submitButton.disabled = true;
    try {
      const outcome = await app.saveReminder({
        label: label.input.value,
        kind: kind.value,
        intervalKm: intervalKm.input.value,
        lastKm: lastKm.input.value,
        dueDate: dueDate.input.value,
        intervalMonths: intervalMonths.input.value,
      }, editing?.id ?? null);
      for (const [key, field] of Object.entries(fieldsByKey)) field.setError(outcome.errors[key]);
      if (!outcome.ok) {
        focusFirstInvalid(form);
        return;
      }
      ctx.toast(editing ? 'Rappel modifié.' : 'Rappel ajouté.');
      ctx.navigate('/vehicule');
    } finally {
      submitButton.disabled = false;
    }
  }

  async function markDone() {
    await app.markReminderDone(editing.id);
    ctx.toast('C’est noté : prochaine échéance mise à jour.');
    ctx.navigate('/vehicule');
  }

  async function remove() {
    const confirmed = await confirmDialog({ title: `Supprimer le rappel « ${editing.label} » ?`, confirmLabel: 'Supprimer', danger: true });
    if (!confirmed) return;
    await app.deleteReminder(editing.id);
    ctx.toast('Rappel supprimé.');
    ctx.navigate('/vehicule');
  }

  const form = h('form', { class: 'stack form', novalidate: true, on: { submit: (event) => { event.preventDefault(); submit(); } } },
    presets, label.root, kind.root, kmGroup, dateGroup,
    h('div', { class: 'form-actions' },
      submitButton,
      editing && canComplete(editing) && h('button', { type: 'button', class: 'btn btn-secondary', on: { click: markDone } }, 'Marquer comme fait aujourd’hui'),
      editing && h('button', { type: 'button', class: 'btn btn-danger-ghost', on: { click: remove } }, 'Supprimer ce rappel')));

  return h('div', { class: 'stack' }, formHeader(editing ? 'Modifier le rappel' : 'Nouveau rappel', '/vehicule'), form);
}
