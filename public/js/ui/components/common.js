/** Éléments d'interface réutilisés par plusieurs écrans. */

import { h } from '../../core/dom.js';
import { icon } from './icons.js';

/** En-tête d'écran principal : titre + action facultative à droite. */
export function screenHeader(title, action = null, eyebrow = null) {
  return h('header', { class: 'screen-header' },
    h('div', { class: 'stack-1' },
      eyebrow && h('p', { class: 'eyebrow' }, eyebrow),
      h('h1', { class: 'title', tabindex: '-1' }, title)),
    action);
}

/** En-tête de formulaire : bouton retour + titre. */
export function formHeader(title, backPath) {
  return h('header', { class: 'form-header' },
    h('a', { class: 'icon-btn icon-btn-plain', href: `#${backPath}`, 'aria-label': 'Retour' }, icon('back')),
    h('h1', { class: 'title title-form', tabindex: '-1' }, title));
}

export function emptyState({ title, text, actions = [] }) {
  return h('section', { class: 'card empty-state' },
    h('h2', { class: 'card-title' }, title),
    text && h('p', { class: 'muted' }, text),
    actions.length > 0 && h('div', { class: 'stack-2' }, actions));
}

export function notFound(message = 'Cette page n’existe pas ou plus.') {
  return h('div', { class: 'stack' },
    screenHeader('Introuvable'),
    emptyState({ title: message, actions: [h('a', { class: 'btn btn-primary', href: '#/' }, 'Retour à l’accueil')] }));
}

/** Ligne de liste cliquable : icône, textes, élément à droite et chevron. */
export function actionRow({ iconName, label, detail, onClick, href, danger = false, focusKey }) {
  const content = [
    h('span', { class: ['row-icon', danger && 'row-icon-danger'] }, icon(iconName, { size: 20 })),
    h('span', { class: 'row-main' },
      h('span', { class: ['row-title', danger && 'text-danger'] }, label),
      detail && h('span', { class: 'row-sub' }, detail)),
    h('span', { class: 'row-chevron' }, icon('chevron', { size: 18 })),
  ];
  if (href) return h('a', { class: 'row-link', href }, content);
  return h('button', { type: 'button', class: 'row-link', dataset: focusKey ? { focusKey } : {}, on: { click: onClick } }, content);
}
