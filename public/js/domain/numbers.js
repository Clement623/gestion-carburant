/**
 * Lecture et affichage des nombres au format français.
 *
 * - Saisie : « 38,2 » et « 38.2 » sont acceptés ; « 48 320 » ou « 48.320 » pour un kilométrage.
 * - Affichage : Intl.NumberFormat('fr-FR') (virgule décimale, espace fine insécable
 *   entre les milliers, symbole € placé après le montant).
 */

// En JavaScript, \s couvre aussi l'espace insécable et l'espace fine insécable.
const ALL_SPACES = /\s/g;
const NBSP = String.fromCharCode(0x00a0); // espace insécable entre le nombre et l'unité
const MINUS = '−';

/** Convertit une saisie décimale en nombre. Retourne NaN si la saisie n'est pas un nombre positif. */
export function parseDecimal(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : Number.NaN;
  if (typeof input !== 'string') return Number.NaN;
  const compact = input.replace(ALL_SPACES, '');
  if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(compact)) return Number.NaN;
  return Number(compact.replace(',', '.'));
}

/** Convertit une saisie entière (kilométrage). Les séparateurs de milliers sont tolérés. */
export function parseInteger(input) {
  if (typeof input === 'number') return Number.isInteger(input) ? input : Number.NaN;
  if (typeof input !== 'string') return Number.NaN;
  const normalized = input.trim().replace(ALL_SPACES, ' ');
  if (/^\d{1,3}([. ]\d{3})+$/.test(normalized)) return Number(normalized.replace(/[. ]/g, ''));
  const compact = normalized.replace(ALL_SPACES, '');
  return /^\d+$/.test(compact) ? Number(compact) : Number.NaN;
}

/** Arrondi décimal fiable (1.005 → 1.01), là où Math.round(x * 100) / 100 se trompe. */
export function round(value, decimals = 0) {
  if (!Number.isFinite(value)) return Number.NaN;
  const factor = 10 ** decimals;
  return Math.round(value * factor * (1 + Number.EPSILON)) / factor;
}

// Intl sépare les milliers par une espace fine (U+202F), peu visible avec certaines polices :
// on la remplace par une espace insécable classique (« 51 724 km » reste sur une ligne).
const NARROW_NBSP = new RegExp(String.fromCharCode(0x202f), 'g');
const readable = (formatter) => ({ format: (value) => formatter.format(value).replace(NARROW_NBSP, NBSP) });

const formatters = new Map();
function numberFormat(min, max) {
  const key = `${min}-${max}`;
  if (!formatters.has(key)) {
    formatters.set(key, readable(new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max })));
  }
  return formatters.get(key);
}
const euroFormat = readable(new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }));

export function formatNumber(value, minDecimals = 0, maxDecimals = minDecimals) {
  return Number.isFinite(value) ? numberFormat(minDecimals, maxDecimals).format(value) : '—';
}

export function formatEuro(value) {
  return Number.isFinite(value) ? euroFormat.format(value) : '—';
}

export function formatKm(value) {
  return Number.isFinite(value) ? `${numberFormat(0, 0).format(value)}${NBSP}km` : '—';
}

export function formatLiters(value) {
  return Number.isFinite(value) ? `${numberFormat(1, 2).format(value)}${NBSP}L` : '—';
}

/** Volume arrondi au litre : « 504 L ». */
export function formatVolume(value) {
  return Number.isFinite(value) ? `${numberFormat(0, 0).format(value)}${NBSP}L` : '—';
}

export function formatPricePerLiter(value) {
  return Number.isFinite(value) ? `${numberFormat(3, 3).format(value)}${NBSP}€/L` : '—';
}

/** Valeur de consommation dans l'unité choisie : L/100 km tel quel, ou km/L (= 100 / L/100 km). */
export function consumptionValue(l100, unit) {
  if (!Number.isFinite(l100) || l100 <= 0) return null;
  return unit === 'kml' ? 100 / l100 : l100;
}

export function consumptionUnitLabel(unit, short = false) {
  if (unit === 'kml') return 'km/L';
  return short ? 'L/100' : 'L/100 km';
}

export function formatConsumptionNumber(l100, unit) {
  const value = consumptionValue(l100, unit);
  return value == null ? '—' : numberFormat(1, 1).format(value);
}

export function formatConsumption(l100, unit, short = false) {
  const value = consumptionValue(l100, unit);
  return value == null ? '—' : `${numberFormat(1, 1).format(value)}${NBSP}${consumptionUnitLabel(unit, short)}`;
}

/** Écart signé avec le vrai signe moins typographique : « −0,1 », « +0,3 », « ±0,0 ». */
export function formatSigned(value, decimals = 1) {
  if (!Number.isFinite(value)) return '—';
  const rounded = round(value, decimals);
  const abs = numberFormat(decimals, decimals).format(Math.abs(rounded));
  if (rounded === 0) return `±${abs}`;
  return `${rounded > 0 ? '+' : MINUS}${abs}`;
}

/** Valeur à replacer dans un champ de saisie (sans espace de milliers, pour pouvoir la retaper). */
export function toInputDecimal(value, maxDecimals = 3) {
  return Number.isFinite(value) ? String(round(value, maxDecimals)).replace('.', ',') : '';
}

export function toInputFixed(value, decimals) {
  return Number.isFinite(value) ? round(value, decimals).toFixed(decimals).replace('.', ',') : '';
}

export function toInputInteger(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : '';
}

/** « 1 plein », « 3 pleins » (en français, 0 et 1 sont au singulier). */
export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${formatNumber(count)} ${count > 1 ? pluralForm : singular}`;
}
