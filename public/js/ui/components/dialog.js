/**
 * Boîtes de dialogue modales basées sur l'élément natif <dialog> :
 * focus piégé dans la fenêtre, touche Échap gérée, fond inerte, le tout fourni par le navigateur.
 */

import { h } from '../../core/dom.js';
import { validatePassphrase } from '../../domain/validation.js';

let counter = 0;

function mount(dialog) {
  document.body.append(dialog);
  dialog.showModal();
}

/** Demande de confirmation. Résout true (confirmé) ou false. */
export function confirmDialog({ title, message, details = [], confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false }) {
  return new Promise((resolve) => {
    const id = `dialog-${++counter}`;
    let settled = false;
    const finish = (answer) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(answer);
    };
    const cancelButton = h('button', { type: 'button', class: 'btn btn-secondary', on: { click: () => finish(false) } }, cancelLabel);
    const confirmButton = h('button', { type: 'button', class: ['btn', danger ? 'btn-danger' : 'btn-primary'], on: { click: () => finish(true) } }, confirmLabel);
    const dialog = h('dialog', {
      class: 'dialog',
      'aria-labelledby': `${id}-title`,
      'aria-describedby': `${id}-body`,
      on: { cancel: (event) => { event.preventDefault(); finish(false); } },
    },
    h('h2', { id: `${id}-title`, class: 'dialog-title' }, title),
    h('div', { id: `${id}-body`, class: 'dialog-body' },
      message && h('p', {}, message),
      details.length > 0 && h('ul', { class: 'dialog-list' }, details.map((detail) => h('li', {}, detail)))),
    h('div', { class: 'dialog-actions' }, cancelButton, confirmButton));
    mount(dialog);
    (danger ? cancelButton : confirmButton).focus(); // action destructrice : le focus reste sur « Annuler »
  });
}

/** Message d'information avec un seul bouton. */
export function alertDialog({ title, message, details = [] }) {
  return new Promise((resolve) => {
    const id = `dialog-${++counter}`;
    const close = () => {
      dialog.close();
      dialog.remove();
      resolve();
    };
    const okButton = h('button', { type: 'button', class: 'btn btn-primary', on: { click: close } }, 'Compris');
    const dialog = h('dialog', {
      class: 'dialog',
      'aria-labelledby': `${id}-title`,
      'aria-describedby': `${id}-body`,
      on: { cancel: (event) => { event.preventDefault(); close(); } },
    },
    h('h2', { id: `${id}-title`, class: 'dialog-title' }, title),
    h('div', { id: `${id}-body`, class: 'dialog-body' },
      message && h('p', {}, message),
      details.length > 0 && h('ul', { class: 'dialog-list' }, details.map((detail) => h('li', {}, detail)))),
    h('div', { class: 'dialog-actions' }, okButton));
    mount(dialog);
    okButton.focus();
  });
}

/**
 * Saisie d'un mot de passe. Avec `confirm`, il est demandé deux fois et sa longueur est vérifiée.
 * Résout le mot de passe, ou null si l'utilisateur annule.
 */
export function passwordDialog({ title, message, confirm = false, submitLabel = 'Valider' }) {
  return new Promise((resolve) => {
    const id = `dialog-${++counter}`;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const autocomplete = confirm ? 'new-password' : 'current-password';
    const first = h('input', { id: `${id}-pass`, type: 'password', class: 'input', autocomplete, required: true, 'aria-describedby': `${id}-error` });
    const second = confirm
      ? h('input', { id: `${id}-pass2`, type: 'password', class: 'input', autocomplete, required: true, 'aria-describedby': `${id}-error` })
      : null;
    const error = h('p', { id: `${id}-error`, class: 'field-error', hidden: true });
    const showError = (text) => {
      error.textContent = text;
      error.hidden = false;
      first.setAttribute('aria-invalid', 'true');
      first.focus();
    };
    const form = h('form', {
      class: 'stack-3',
      novalidate: true,
      on: {
        submit: (event) => {
          event.preventDefault();
          if (confirm) {
            const problem = validatePassphrase(first.value, second.value);
            if (problem) {
              showError(problem);
              return;
            }
          } else if (!first.value) {
            showError('Saisissez le mot de passe.');
            return;
          }
          finish(first.value);
        },
      },
    },
    h('div', { class: 'field' }, h('label', { for: `${id}-pass`, class: 'field-label' }, 'Mot de passe'), first),
    second && h('div', { class: 'field' }, h('label', { for: `${id}-pass2`, class: 'field-label' }, 'Confirmez le mot de passe'), second),
    error,
    h('div', { class: 'dialog-actions' },
      h('button', { type: 'button', class: 'btn btn-secondary', on: { click: () => finish(null) } }, 'Annuler'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel)));

    const dialog = h('dialog', {
      class: 'dialog',
      'aria-labelledby': `${id}-title`,
      'aria-describedby': `${id}-body`,
      on: { cancel: (event) => { event.preventDefault(); finish(null); } },
    },
    h('h2', { id: `${id}-title`, class: 'dialog-title' }, title),
    h('p', { id: `${id}-body`, class: 'dialog-body' }, message),
    form);
    mount(dialog);
    first.focus();
  });
}
