/** Barre d'onglets du bas, avec le bouton central « + » pour ajouter un plein. */

import { h } from '../../core/dom.js';
import { icon } from './icons.js';

const TABS = [
  { id: 'home', path: '/', label: 'Accueil', icon: 'home' },
  { id: 'history', path: '/historique', label: 'Historique', icon: 'list' },
  { id: 'add', path: '/plein/nouveau', label: 'Ajouter un plein', icon: 'plus', fab: true },
  { id: 'stats', path: '/stats', label: 'Stats', icon: 'chart' },
  { id: 'vehicle', path: '/vehicule', label: 'Véhicule', icon: 'car' },
];

export function renderTabbar(nav, activeTab) {
  nav.replaceChildren(...TABS.map((tab) => {
    if (tab.fab) {
      return h('a', { href: `#${tab.path}`, class: 'tab-fab', 'aria-label': tab.label }, icon('plus', { size: 26, strokeWidth: 2.2 }));
    }
    return h('a', { href: `#${tab.path}`, class: 'tab', 'aria-current': tab.id === activeTab ? 'page' : null },
      icon(tab.icon),
      h('span', { class: 'tab-label' }, tab.label));
  }));
}
