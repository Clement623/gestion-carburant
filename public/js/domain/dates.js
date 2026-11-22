/**
 * Dates « calendaires » au format ISO AAAA-MM-JJ, sans heure ni fuseau horaire.
 * Un plein a lieu un jour donné : stocker une simple chaîne évite tout décalage
 * lié aux fuseaux horaires ou au passage à l'heure d'été.
 * Les calculs se font en UTC, l'affichage passe par Intl.DateTimeFormat('fr-FR').
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidISODate(value) {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** Date du jour (fuseau local de l'appareil) au format AAAA-MM-JJ. */
export function todayISO(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function toUTC(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromUTC(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  return fromUTC(toUTC(iso) + days * DAY_MS);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((toUTC(toIso) - toUTC(fromIso)) / DAY_MS);
}

/** Ajoute des mois en restant sur un jour valide (31 janvier + 1 mois → 28 ou 29 février). */
export function addMonths(iso, months) {
  const [year, month, day] = iso.split('-').map(Number);
  const total = year * 12 + (month - 1) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = total - newYear * 12 + 1;
  const newDay = Math.min(day, daysInMonth(newYear, newMonth));
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
}

export const monthKey = (iso) => iso.slice(0, 7);
export const monthStart = (key) => `${key}-01`;

export function monthEnd(key) {
  const [year, month] = key.split('-').map(Number);
  return `${key}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
}

export function previousMonthKey(key) {
  return monthKey(addMonths(monthStart(key), -1));
}

/** Les `count` derniers mois, du plus ancien au plus récent, mois en cours inclus. */
export function lastMonthKeys(count, todayIso) {
  const current = monthStart(monthKey(todayIso));
  const keys = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) keys.push(monthKey(addMonths(current, -offset)));
  return keys;
}

// --- Affichage -----------------------------------------------------------------------------

const format = (options) => new Intl.DateTimeFormat('fr-FR', { ...options, timeZone: 'UTC' });
const FORMATS = {
  weekdayShort: format({ weekday: 'short' }),
  dayMonth: format({ day: 'numeric', month: 'short' }),
  long: format({ weekday: 'long', day: 'numeric', month: 'long' }),
  full: format({ day: 'numeric', month: 'long', year: 'numeric' }),
  short: format({ day: '2-digit', month: '2-digit', year: 'numeric' }),
  monthLong: format({ month: 'long' }),
  monthShort: format({ month: 'short' }),
  monthNarrow: format({ month: 'narrow' }),
  monthYear: format({ month: 'long', year: 'numeric' }),
};

// Midi UTC : aucun fuseau ne peut faire basculer la date affichée.
const atNoon = (iso) => new Date(toUTC(iso) + 12 * 3_600_000);
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export const formatWeekdayShort = (iso) => FORMATS.weekdayShort.format(atNoon(iso)); // « sam. »
export const formatDayMonth = (iso) => FORMATS.dayMonth.format(atNoon(iso)); // « 7 nov. »
export const formatLongDate = (iso) => capitalize(FORMATS.long.format(atNoon(iso))); // « Samedi 7 novembre »
export const formatFullDate = (iso) => FORMATS.full.format(atNoon(iso)); // « 7 novembre 2026 »
export const formatShortDate = (iso) => FORMATS.short.format(atNoon(iso)); // « 07/11/2026 »
export const formatMonthName = (key) => FORMATS.monthLong.format(atNoon(monthStart(key))); // « novembre »
export const formatMonthShort = (key) => FORMATS.monthShort.format(atNoon(monthStart(key))); // « nov. »
export const formatMonthNarrow = (key) => FORMATS.monthNarrow.format(atNoon(monthStart(key))); // « N »
export const formatMonthYear = (key) => capitalize(FORMATS.monthYear.format(atNoon(monthStart(key)))); // « Novembre 2026 »
export const dayOfMonth = (iso) => String(Number(iso.slice(8, 10))).padStart(2, '0');

/** « Sam. 7 nov. » */
export function formatWeekdayDayMonth(iso) {
  return capitalize(`${formatWeekdayShort(iso)} ${formatDayMonth(iso)}`);
}
