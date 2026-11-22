/**
 * Messages éphémères (« Plein enregistré. ») annoncés aux lecteurs d'écran
 * via la zone aria-live déclarée dans index.html.
 */

import { h } from '../../core/dom.js';

export function showToast(message, { tone = 'info', action = null, duration = action ? 12_000 : 4_500 } = {}) {
  const region = document.getElementById('toasts');
  if (!region) return;
  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    toast.remove();
  };
  const toast = h('div', { class: ['toast', `toast-${tone}`], role: tone === 'error' ? 'alert' : null },
    h('span', { class: 'toast-text' }, message),
    action && h('button', {
      type: 'button',
      class: 'toast-action',
      on: { click: () => { dismiss(); action.onClick(); } },
    }, action.label));
  region.replaceChildren(toast); // un seul message à la fois : le plus récent
  timer = setTimeout(dismiss, duration);
}
