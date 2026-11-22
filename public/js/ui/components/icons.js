/**
 * Icônes au trait (24 × 24), dessinées en SVG dans le code : aucune police d'icônes ni requête externe.
 * Elles sont décoratives (aria-hidden) : le sens est toujours porté par un texte ou un aria-label.
 */

import { svg } from '../../core/dom.js';

const PATHS = {
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  list: ['M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01'],
  chart: ['M4 20V11M10 20V5M16 20v-8M21 20H3'],
  car: [
    'M3 13l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v5h-3v-2H6v2H3z',
    'M6.5 13.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M15.5 13.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  ],
  plus: ['M12 5v14M5 12h14'],
  back: ['M15 18l-6-6 6-6'],
  chevron: ['M9 6l6 6-6 6'],
  download: ['M12 4v11M7 10l5 5 5-5M5 20h14'],
  upload: ['M12 15V4M7 9l5-5 5 5M5 20h14'],
  pump: ['M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M4 10h11M15 8l3 2v7a1.5 1.5 0 0 0 3 0V8l-3-3'],
  alert: ['M12 9v4M12 17h.01', 'M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
  lock: ['M5 11h14v10H5z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  shield: ['M12 3l8 3v6c0 5-3.4 8.2-8 9.5C7.4 20.2 4 17 4 12V6z', 'M9 12l2 2 4-4'],
  trash: ['M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'],
  check: ['M5 12l5 5 9-10'],
  table: ['M4 5h16v14H4zM4 10h16M10 5v14'],
  play: ['M8 5v14l11-7z'],
  install: ['M12 3v12M7 10l5 5 5-5', 'M5 21h14'],
  wrench: ['M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z'],
};

export function icon(name, { size = 24, strokeWidth = 1.8 } = {}) {
  return svg('svg', {
    class: 'icon',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': strokeWidth,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  }, (PATHS[name] ?? []).map((d) => svg('path', { d })));
}
