/**
 * Petits graphiques sans bibliothèque :
 * - barChart  : histogramme vertical en HTML (base zéro, valeur affichée au-dessus de chaque barre) ;
 * - lineChart : courbe en SVG avec ligne d'objectif en pointillés.
 * Chaque graphique est une image accessible (role="img") dont aria-label énonce toutes les valeurs.
 */

import { h, svg } from '../../core/dom.js';

export function barChart({ bars, ariaLabel, height = 96, className = null }) {
  const max = Math.max(0, ...bars.map((bar) => bar.value)) || 1;
  const columns = { '--cols': String(bars.length) };
  const hasLabels = bars.some((bar) => bar.label);
  return h('figure', { class: ['chart', 'bar-chart', className], role: 'img', 'aria-label': ariaLabel },
    h('div', { class: 'bar-chart-plot', style: { ...columns, '--plot-h': `${height + 20}px` } },
      bars.map((bar) => h('div', { class: 'bar-col' },
        h('span', { class: 'bar-value' }, bar.display),
        h('span', {
          class: ['bar', bar.highlight && 'bar-highlight', bar.pending && 'bar-pending', bar.value <= 0 && 'bar-empty'],
          style: { height: `${bar.value <= 0 ? 0 : Math.max(3, Math.round((bar.value / max) * height))}px` },
        })))),
    hasLabels && h('div', { class: 'chart-axis', style: columns, 'aria-hidden': 'true' }, bars.map((bar) => h('span', {}, bar.label))));
}

export function lineChart({ points, target = null, targetLabel = '', format, ariaLabel }) {
  const width = 320;
  const height = 132;
  const top = 26;
  const bottom = 14;
  const values = points.map((point) => point.value).filter(Number.isFinite);
  const bounds = target != null ? [...values, target] : values;
  let low = bounds.length ? Math.min(...bounds) : 0;
  let high = bounds.length ? Math.max(...bounds) : 1;
  const span = Math.max(high - low, 0.6);
  low -= span * 0.2;
  high += span * 0.1;

  const x = (index) => (width / points.length) * (index + 0.5);
  const y = (value) => top + ((high - value) / (high - low)) * (height - top - bottom);

  // Un mois sans mesure interrompt la courbe au lieu de relier des points éloignés.
  const runs = [];
  let run = [];
  points.forEach((point, index) => {
    if (Number.isFinite(point.value)) run.push(`${x(index).toFixed(1)},${y(point.value).toFixed(1)}`);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);
  const lastIndex = points.findLastIndex((point) => Number.isFinite(point.value));

  return h('figure', { class: 'chart line-chart', role: 'img', 'aria-label': ariaLabel },
    svg('svg', { class: 'line-chart-svg', viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', focusable: 'false' },
      target != null && svg('line', { class: 'lc-target', x1: 0, x2: width, y1: y(target).toFixed(1), y2: y(target).toFixed(1) }),
      runs.map((coordinates) => svg('polyline', { class: 'lc-line', points: coordinates.join(' ') })),
      points.map((point, index) => Number.isFinite(point.value) && svg('g', {},
        svg('circle', { class: ['lc-dot', index === lastIndex && 'lc-dot-last'], cx: x(index).toFixed(1), cy: y(point.value).toFixed(1), r: index === lastIndex ? 5 : 4 }),
        svg('text', { class: 'lc-value', x: x(index).toFixed(1), y: (y(point.value) - 10).toFixed(1), 'text-anchor': 'middle' }, format(point.value))))),
    h('div', { class: 'chart-axis', style: { '--cols': String(points.length) }, 'aria-hidden': 'true' }, points.map((point) => h('span', {}, point.label))),
    // Légende sous le graphique : l'étiquette de l'objectif ne peut pas chevaucher les valeurs.
    target != null && h('p', { class: 'chart-legend', 'aria-hidden': 'true' }, h('span', { class: 'legend-dash' }), targetLabel));
}
