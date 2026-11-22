/**
 * Rappels d'entretien.
 * - « km »   : tous les N km depuis le dernier entretien (vidange, courroie…) ;
 * - « date » : à une échéance, éventuellement répétée tous les N mois (contrôle technique, assurance…).
 */

import { addMonths, daysBetween, formatShortDate } from './dates.js';
import { formatKm } from './numbers.js';

export const REMINDER_PRESETS = Object.freeze([
  Object.freeze({ label: 'Vidange', kind: 'km', intervalKm: 15_000 }),
  Object.freeze({ label: 'Contrôle technique', kind: 'date', intervalMonths: 24 }),
  Object.freeze({ label: 'Pression des pneus', kind: 'date', intervalMonths: 1 }),
  Object.freeze({ label: 'Courroie de distribution', kind: 'km', intervalKm: 120_000 }),
  Object.freeze({ label: 'Assurance', kind: 'date', intervalMonths: 12 }),
]);

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const days = (count) => `${count} jour${count > 1 ? 's' : ''}`;

/**
 * État d'un rappel : 'ok', 'soon' (bientôt) ou 'overdue' (dépassé),
 * avec une progression entre 0 et 1 et un libellé d'échéance lisible.
 */
export function reminderStatus(reminder, { currentKm, today }) {
  if (reminder.kind === 'km') {
    const reference = Number.isFinite(currentKm) ? currentKm : reminder.lastKm;
    const dueKm = reminder.lastKm + reminder.intervalKm;
    const remaining = dueKm - reference;
    const soonThreshold = Math.max(500, reminder.intervalKm * 0.1);
    let state = 'ok';
    if (remaining < 0) state = 'overdue';
    else if (remaining <= soonThreshold) state = 'soon';
    return {
      state,
      progress: clamp01((reference - reminder.lastKm) / reminder.intervalKm),
      dueLabel: remaining >= 0 ? `dans ${formatKm(remaining)}` : `en retard de ${formatKm(-remaining)}`,
    };
  }

  const left = daysBetween(today, reminder.dueDate);
  let state = 'ok';
  if (left < 0) state = 'overdue';
  else if (left <= 30) state = 'soon';

  let progress;
  if (reminder.intervalMonths) {
    const start = addMonths(reminder.dueDate, -reminder.intervalMonths);
    const total = daysBetween(start, reminder.dueDate);
    progress = total > 0 ? clamp01(daysBetween(start, today) / total) : 1;
  } else {
    progress = left <= 0 ? 1 : clamp01(1 - left / 365);
  }

  let dueLabel;
  if (left < 0) dueLabel = `en retard de ${days(-left)}`;
  else if (left === 0) dueLabel = "aujourd'hui";
  else if (left <= 30) dueLabel = `dans ${days(left)}`;
  else dueLabel = `le ${formatShortDate(reminder.dueDate)}`;

  return { state, progress, dueLabel };
}

/** Un rappel peut être « marqué comme fait » s'il se répète. */
export function canComplete(reminder) {
  return reminder.kind === 'km' || Boolean(reminder.intervalMonths);
}

/** Nouveau rappel après entretien : repart du compteur actuel ou d'aujourd'hui. */
export function completeReminder(reminder, { currentKm, today }) {
  if (reminder.kind === 'km') {
    return { ...reminder, lastKm: Number.isFinite(currentKm) ? currentKm : reminder.lastKm };
  }
  if (reminder.intervalMonths) return { ...reminder, dueDate: addMonths(today, reminder.intervalMonths) };
  return reminder;
}

const URGENCY = { overdue: 0, soon: 1, ok: 2 };

/** Rappels avec leur état, les plus urgents d'abord. */
export function rankReminders(reminders, context) {
  return reminders
    .map((reminder) => ({ reminder, status: reminderStatus(reminder, context) }))
    .sort((a, b) => URGENCY[a.status.state] - URGENCY[b.status.state] || b.status.progress - a.status.progress);
}
