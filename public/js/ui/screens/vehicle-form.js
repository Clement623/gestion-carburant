/** Formulaire véhicule : création, modification, suppression (avec ses pleins et rappels). */

import { h } from '../../core/dom.js';
import { FUEL_TYPES, LIMITS } from '../../domain/constants.js';
import { plural, toInputDecimal } from '../../domain/numbers.js';
import { formHeader, notFound } from '../components/common.js';
import { confirmDialog } from '../components/dialog.js';
import { focusFirstInvalid, segmented, textField } from '../components/fields.js';

export function renderVehicleForm(ctx) {
  const { app, params } = ctx;
  const editing = params.id ? app.findVehicle(params.id) : null;
  if (params.id && !editing) return notFound('Ce véhicule est introuvable.');
  const isFirst = app.state.vehicles.length === 0;

  const name = textField({ id: 'v-name', label: 'Nom', value: editing?.name ?? '', placeholder: 'Ma voiture', maxlength: LIMITS.nameMax, required: true, autocapitalize: 'sentences' });
  const model = textField({ id: 'v-model', label: 'Marque et modèle', optional: true, value: editing?.model ?? '', placeholder: 'Ex. citadine essence', maxlength: LIMITS.modelMax });
  const plate = textField({ id: 'v-plate', label: 'Immatriculation', optional: true, value: editing?.plate ?? '', placeholder: 'AB-123-CD', maxlength: LIMITS.plateMax, autocapitalize: 'characters' });
  const fuel = segmented({
    id: 'v-fuel',
    label: 'Carburant habituel',
    columns: 3,
    value: editing?.fuelType ?? 'E10',
    options: FUEL_TYPES.map((type) => ({ value: type.id, label: type.short })),
  });
  const tank = textField({
    id: 'v-tank',
    label: 'Capacité du réservoir (L)',
    optional: true,
    inputmode: 'decimal',
    value: editing?.tankCapacity ? toInputDecimal(editing.tankCapacity, 1) : '',
    placeholder: '45',
    hint: 'Sert à estimer l’autonomie et à repérer les erreurs de saisie.',
  });
  const target = textField({
    id: 'v-target',
    label: 'Objectif de consommation (L/100 km)',
    optional: true,
    inputmode: 'decimal',
    value: editing?.consumptionTarget ? toInputDecimal(editing.consumptionTarget, 1) : '',
    placeholder: '6,0',
    hint: 'Affiché sur l’accueil et dans les statistiques.',
    enterkeyhint: 'done',
  });

  const fieldsByKey = { name, plate, fuelType: fuel, tankCapacity: tank, consumptionTarget: target };
  const submitButton = h('button', { type: 'submit', class: 'btn btn-primary' }, editing ? 'Enregistrer' : 'Ajouter le véhicule');

  async function submit() {
    submitButton.disabled = true;
    try {
      const outcome = await app.saveVehicle({
        name: name.input.value,
        model: model.input.value,
        plate: plate.input.value,
        fuelType: fuel.value,
        tankCapacity: tank.input.value,
        consumptionTarget: target.input.value,
      }, editing?.id ?? null);
      for (const [key, field] of Object.entries(fieldsByKey)) field.setError(outcome.errors[key]);
      if (!outcome.ok) {
        focusFirstInvalid(form);
        return;
      }
      ctx.toast(editing ? 'Véhicule modifié.' : 'Véhicule ajouté.');
      ctx.navigate(isFirst ? '/' : '/vehicule');
    } catch (error) {
      console.error(error);
      ctx.toast(`Enregistrement impossible : ${error.message}`, { tone: 'error' });
    } finally {
      submitButton.disabled = false;
    }
  }

  async function remove() {
    const count = editing.id === app.state.activeVehicleId ? app.state.fillups.length : null;
    const confirmed = await confirmDialog({
      title: `Supprimer « ${editing.name} » ?`,
      message: count == null
        ? 'Ses pleins et ses rappels seront supprimés définitivement.'
        : `Ses ${plural(count, 'plein')} et ses rappels seront supprimés définitivement.`,
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!confirmed) return;
    await app.deleteVehicle(editing.id);
    ctx.toast('Véhicule supprimé.');
    ctx.navigate('/vehicule');
  }

  const form = h('form', { class: 'stack form', novalidate: true, on: { submit: (event) => { event.preventDefault(); submit(); } } },
    name.root, model.root, plate.root, fuel.root, tank.root, target.root,
    h('div', { class: 'form-actions' },
      submitButton,
      editing && h('button', { type: 'button', class: 'btn btn-danger-ghost', on: { click: remove } }, 'Supprimer ce véhicule')));

  return h('div', { class: 'stack' }, formHeader(editing ? 'Modifier le véhicule' : 'Nouveau véhicule', isFirst ? '/' : '/vehicule'), form);
}
