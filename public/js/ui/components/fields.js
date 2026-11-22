/**
 * Champs de formulaire accessibles : chaque champ a son <label>, son aide et son message d'erreur
 * reliés par aria-describedby ; une erreur positionne aria-invalid pour les lecteurs d'écran.
 */

import { h } from '../../core/dom.js';

function errorController(control, errorElement) {
  return (message) => {
    errorElement.textContent = message ?? '';
    errorElement.hidden = !message;
    if (message) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
  };
}

export function textField({
  id, label, value = '', type = 'text', inputmode, placeholder, hint, maxlength, autocomplete = 'off',
  list, max, min, optional = false, required = false, autocapitalize, enterkeyhint = 'next',
}) {
  const hintId = hint ? `${id}-hint` : null;
  const errorId = `${id}-error`;
  const input = h('input', {
    id,
    name: id,
    type,
    inputmode,
    placeholder,
    maxlength,
    autocomplete,
    list,
    max,
    min,
    required,
    autocapitalize,
    enterkeyhint,
    spellcheck: 'false',
    class: 'input',
    'aria-describedby': [hintId, errorId].filter(Boolean).join(' '),
  });
  input.value = value;
  const error = h('p', { id: errorId, class: 'field-error', hidden: true });
  const root = h('div', { class: 'field' },
    h('label', { for: id, class: 'field-label' }, label, optional && h('span', { class: 'field-optional' }, ' (facultatif)')),
    input,
    hint && h('p', { id: hintId, class: 'field-hint' }, hint),
    error);
  return { root, input, setError: errorController(input, error) };
}

/** Choix exclusif sous forme de boutons (carburant, unité, type de rappel…). */
export function segmented({ id, label, options, value, onChange, columns = options.length, hideLabel = false }) {
  let current = value;
  const labelId = `${id}-label`;
  const error = h('p', { id: `${id}-error`, class: 'field-error', hidden: true });
  const buttons = options.map((option) => h('button', {
    type: 'button',
    class: 'seg-btn',
    'aria-pressed': String(option.value === current),
    dataset: { value: option.value, focusKey: `${id}-${option.value}` },
    on: { click: () => select(option.value, true) },
  }, option.label));
  const group = h('div', {
    class: 'segmented',
    role: 'group',
    'aria-labelledby': labelId,
    'aria-describedby': `${id}-error`,
    style: { '--cols': String(columns) },
  }, buttons);

  function select(next, fromUser) {
    current = next;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.value === next));
    if (fromUser) onChange?.(next);
  }

  const root = h('div', { class: 'field' },
    h('span', { id: labelId, class: ['field-label', hideLabel && 'sr-only'] }, label),
    group,
    error);
  return {
    root,
    get value() {
      return current;
    },
    select,
    setError: errorController(group, error),
  };
}

/** Interrupteur (case à cocher avec rôle switch). */
export function switchField({ id, label, hint, checked = false, onChange }) {
  const input = h('input', {
    id,
    type: 'checkbox',
    role: 'switch',
    class: 'switch-input',
    'aria-describedby': hint ? `${id}-hint` : null,
  });
  input.checked = checked;
  if (onChange) input.addEventListener('change', () => onChange(input.checked));
  const root = h('label', { class: 'switch-field', for: id },
    h('span', { class: 'switch-text' },
      h('span', { class: 'switch-label' }, label),
      hint && h('span', { id: `${id}-hint`, class: 'switch-hint' }, hint)),
    input,
    h('span', { class: 'switch-track', 'aria-hidden': 'true' }, h('span', { class: 'switch-knob' })));
  return { root, input };
}

/** Place le focus sur le premier champ en erreur (après une tentative d'enregistrement). */
export function focusFirstInvalid(container) {
  const invalid = container.querySelector('[aria-invalid="true"]');
  if (!invalid) return;
  const target = invalid.matches('input, button') ? invalid : invalid.querySelector('button');
  target?.focus();
  invalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
