/**
 * Export CSV pour Excel, LibreOffice ou Google Sheets (format français : « ; » et virgule décimale).
 *
 * Protection contre l'injection de formules : une cellule qui commence par = + - @ (ou une tabulation,
 * un retour chariot) serait exécutée comme formule par le tableur. On la préfixe d'une apostrophe.
 */

import { analyzeFillups } from '../domain/consumption.js';
import { fuelLabel } from '../domain/constants.js';
import { formatShortDate } from '../domain/dates.js';
import { round } from '../domain/numbers.js';

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[";\r\n]/;
const BOM = String.fromCharCode(0xfeff); // permet à Excel de reconnaître l'UTF-8 (accents)

export function escapeCsvCell(value) {
  let text = value == null ? '' : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (NEEDS_QUOTES.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows) {
  return `${BOM}${rows.map((row) => row.map(escapeCsvCell).join(';')).join('\r\n')}\r\n`;
}

const decimal = (value, decimals) => (Number.isFinite(value) ? String(round(value, decimals)).replace('.', ',') : '');

const HEADER = [
  'Date', 'Véhicule', 'Compteur (km)', 'Litres', 'Prix au litre (€)', 'Montant (€)', 'Carburant',
  'Plein complet', 'Distance depuis le plein précédent (km)', 'Consommation (L/100 km)', 'Station',
];

/** Tous les pleins de tous les véhicules, du plus ancien au plus récent. */
export function fillupsToCsv({ vehicles, fillups }) {
  const rows = [HEADER];
  for (const vehicle of vehicles) {
    const { sorted, info } = analyzeFillups(fillups.filter((fillup) => fillup.vehicleId === vehicle.id));
    for (const fillup of sorted) {
      const details = info.get(fillup.id);
      rows.push([
        formatShortDate(fillup.date),
        vehicle.name,
        String(fillup.odometer),
        decimal(fillup.liters, 2),
        decimal(fillup.pricePerLiter, 3),
        decimal(fillup.totalCost, 2),
        fuelLabel(fillup.fuelType),
        fillup.isFull ? 'oui' : 'non',
        details.distance == null ? '' : String(details.distance),
        details.segment ? decimal(details.segment.l100, 2) : '',
        fillup.station ?? '',
      ]);
    }
  }
  return toCsv(rows);
}
