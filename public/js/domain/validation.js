/**
 * Validation et nettoyage de toutes les données qui entrent dans l'application,
 * qu'elles viennent d'un formulaire ou d'un fichier de sauvegarde importé.
 *
 * Chaque fonction renvoie { ok, value, errors, warnings } :
 * - `value`    : un objet NEUF, reconstruit champ par champ (les champs inconnus sont ignorés) ;
 * - `errors`   : { champ: message } bloquants, affichés sous le champ concerné ;
 * - `warnings` : messages non bloquants (valeur inhabituelle), confirmés par l'utilisateur.
 */

import { FUEL_IDS, LIMITS, UNITS } from './constants.js';
import { previewFillup } from './consumption.js';
import { formatDayMonth, isValidISODate } from './dates.js';
import { formatKm, formatNumber, parseDecimal, parseInteger, round } from './numbers.js';

// Caractères de contrôle, caractères invisibles et marques de direction du texte (anti-usurpation d'affichage).
const charRange = (from, to) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`;
const UNSAFE_CHARS = new RegExp(`[${[
  charRange(0x00, 0x1f), // caractères de contrôle
  charRange(0x7f, 0x9f),
  charRange(0x200b, 0x200f), // espaces de largeur nulle, marques de direction
  charRange(0x2028, 0x202e), // séparateurs de ligne, forçages de direction
  charRange(0x2060, 0x2064),
  charRange(0x2066, 0x2069), // isolats de direction
  String.fromCharCode(0xfeff), // indicateur d'ordre des octets
].join('')}]`, 'g');
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const isSafeId = (value) => typeof value === 'string' && SAFE_ID.test(value);

/** Texte libre nettoyé : caractères invisibles retirés, espaces normalisés, longueur bornée. */
export function cleanText(value, maxLength) {
  if (value == null) return '';
  const text = String(value).replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim();
  return Array.from(text).slice(0, maxLength).join('');
}

function result(value, errors, warnings = []) {
  const ok = Object.keys(errors).length === 0;
  return { ok, value: ok ? value : null, errors, warnings };
}

function toBoolean(value) {
  return value === true || value === 'true' || value === 'on' || value === 1;
}

function optionalDecimal(input, min, max, field, errors, message) {
  if (input === '' || input == null) return null;
  const value = parseDecimal(input);
  if (!Number.isFinite(value) || value < min || value > max) {
    errors[field] = message;
    return null;
  }
  return value;
}

/**
 * Plein de carburant.
 * @param {object} raw  valeurs saisies (chaînes) ou importées (nombres)
 * @param {object} ctx
 *   - today      : date du jour (AAAA-MM-JJ), un plein ne peut pas être dans le futur ;
 *   - vehicle    : véhicule concerné (capacité du réservoir pour les alertes) ;
 *   - others     : autres pleins du véhicule, pour vérifier que le compteur ne recule jamais ;
 *   - checkOrder : false à l'import (la cohérence du fichier est vérifiée globalement).
 * `raw.priceSource` : 'price' (le montant est calculé), 'total' (le prix au litre est calculé)
 *                     ou 'both' (import : les deux valeurs sont fournies et doivent concorder).
 */
export function validateFillup(raw, { today = null, vehicle = null, others = [], checkOrder = true } = {}) {
  const errors = {};
  const warnings = [];

  const date = typeof raw.date === 'string' ? raw.date.trim() : '';
  if (!isValidISODate(date)) errors.date = 'Indiquez une date valide.';
  else if (date < LIMITS.minDate) errors.date = 'Date trop ancienne.';
  else if (today && date > today) errors.date = 'La date ne peut pas être dans le futur.';

  const odometer = parseInteger(raw.odometer);
  if (!Number.isInteger(odometer)) errors.odometer = 'Indiquez le kilométrage du compteur (nombre entier).';
  else if (odometer < 0 || odometer > LIMITS.odometerMax) errors.odometer = `Kilométrage hors limites (0 à ${formatKm(LIMITS.odometerMax)}).`;

  const liters = parseDecimal(raw.liters);
  if (!Number.isFinite(liters) || liters <= 0) errors.liters = 'Indiquez la quantité versée en litres.';
  else if (liters > LIMITS.litersMax) errors.liters = `${LIMITS.litersMax} litres maximum.`;

  // Prix au litre et montant : l'un est saisi, l'autre en découle.
  const source = ['price', 'total', 'both'].includes(raw.priceSource) ? raw.priceSource : 'price';
  let pricePerLiter = parseDecimal(raw.pricePerLiter);
  let totalCost = parseDecimal(raw.totalCost);
  const needsTotal = source === 'total' || source === 'both';
  const needsPrice = source === 'price' || source === 'both';
  if (needsTotal && (!Number.isFinite(totalCost) || totalCost <= 0)) errors.totalCost = 'Indiquez le montant payé.';
  if (needsPrice && (!Number.isFinite(pricePerLiter) || pricePerLiter <= 0)) errors.pricePerLiter = 'Indiquez le prix au litre.';

  if (!errors.liters && !errors.totalCost && !errors.pricePerLiter) {
    if (source === 'price') totalCost = liters * pricePerLiter;
    if (source === 'total') pricePerLiter = totalCost / liters;
    pricePerLiter = round(pricePerLiter, 3);
    totalCost = round(totalCost, 2);
    const priceField = source === 'total' ? 'totalCost' : 'pricePerLiter';
    if (pricePerLiter < LIMITS.priceMin || pricePerLiter > LIMITS.priceMax) {
      errors[priceField] = `Prix au litre improbable (${formatNumber(pricePerLiter, 3)} €/L) : vérifiez la saisie.`;
    } else if (totalCost > LIMITS.totalMax) {
      errors.totalCost = `Montant trop élevé (${formatNumber(LIMITS.totalMax)} € maximum).`;
    } else if (source === 'both' && Math.abs(liters * pricePerLiter - totalCost) > Math.max(0.05, totalCost * 0.005)) {
      errors.totalCost = 'Le montant ne correspond pas aux litres multipliés par le prix au litre.';
    }
  }

  const fuelType = FUEL_IDS.includes(raw.fuelType) ? raw.fuelType : null;
  if (!fuelType) errors.fuelType = 'Choisissez un carburant.';

  const isFull = toBoolean(raw.isFull);
  const station = cleanText(raw.station, LIMITS.stationMax);

  // Le compteur ne recule jamais : le plein doit s'insérer entre le précédent et le suivant.
  if (checkOrder && !errors.date && !errors.odometer) {
    let before = null;
    let after = null;
    for (const other of others) {
      if (other.date < date) {
        if (!before || other.odometer > before.odometer) before = other;
      } else if (other.date > date) {
        if (!after || other.odometer < after.odometer) after = other;
      } else if (other.odometer === odometer) {
        errors.odometer = 'Un plein avec ce kilométrage existe déjà à cette date.';
      }
    }
    if (!errors.odometer && before && odometer <= before.odometer) {
      errors.odometer = `Doit dépasser ${formatKm(before.odometer)} (plein du ${formatDayMonth(before.date)}).`;
    } else if (!errors.odometer && after && odometer >= after.odometer) {
      errors.odometer = `Doit être inférieur à ${formatKm(after.odometer)} (plein du ${formatDayMonth(after.date)}).`;
    }
  }

  const value = { date, odometer, liters: round(liters, 2), pricePerLiter, totalCost, fuelType, isFull, station };

  if (Object.keys(errors).length === 0 && checkOrder) {
    if (vehicle?.tankCapacity && liters > vehicle.tankCapacity * 1.05) {
      warnings.push(`${formatNumber(liters, 0, 2)} L, c'est plus que la capacité du réservoir (${formatNumber(vehicle.tankCapacity, 0, 1)} L).`);
    }
    const preview = previewFillup(others, { ...value, id: raw.id ?? null });
    if (preview?.distance > 3_000) {
      warnings.push(`${formatKm(preview.distance)} depuis le plein précédent : vérifiez le kilométrage.`);
    }
    const l100 = preview?.segment?.l100;
    if (Number.isFinite(l100) && (l100 < 2 || l100 > 30)) {
      warnings.push(`La consommation calculée serait de ${formatNumber(l100, 1, 1)} L/100 km : vérifiez le kilométrage et les litres.`);
    }
  }

  return result(value, errors, warnings);
}

/** Véhicule. */
export function validateVehicle(raw) {
  const errors = {};
  const name = cleanText(raw.name, LIMITS.nameMax);
  if (!name) errors.name = 'Donnez un nom au véhicule.';

  const model = cleanText(raw.model, LIMITS.modelMax);
  const plate = cleanText(raw.plate, LIMITS.plateMax).toUpperCase();
  if (plate && !/^[\p{L}\p{N} -]+$/u.test(plate)) errors.plate = 'Lettres, chiffres, espaces et tirets uniquement.';

  const fuelType = FUEL_IDS.includes(raw.fuelType) ? raw.fuelType : null;
  if (!fuelType) errors.fuelType = 'Choisissez un carburant.';

  const tankCapacity = optionalDecimal(raw.tankCapacity, LIMITS.tankMin, LIMITS.tankMax, 'tankCapacity', errors,
    `Entre ${LIMITS.tankMin} et ${LIMITS.tankMax} litres.`);
  const consumptionTarget = optionalDecimal(raw.consumptionTarget, LIMITS.targetMin, LIMITS.targetMax, 'consumptionTarget', errors,
    `Entre ${LIMITS.targetMin} et ${LIMITS.targetMax} L/100 km.`);

  return result({
    name,
    model,
    plate,
    fuelType,
    tankCapacity: tankCapacity == null ? null : round(tankCapacity, 1),
    consumptionTarget: consumptionTarget == null ? null : round(consumptionTarget, 1),
  }, errors);
}

/** Rappel d'entretien : au kilométrage (tous les N km) ou à une date (avec répétition facultative). */
export function validateReminder(raw) {
  const errors = {};
  const label = cleanText(raw.label, LIMITS.labelMax);
  if (!label) errors.label = 'Donnez un nom au rappel.';

  const kind = raw.kind === 'km' || raw.kind === 'date' ? raw.kind : null;
  if (!kind) errors.kind = 'Choisissez le type de rappel.';

  let value = { label, kind, intervalKm: null, lastKm: null, dueDate: null, intervalMonths: null };

  if (kind === 'km') {
    const intervalKm = parseInteger(raw.intervalKm);
    if (!Number.isInteger(intervalKm) || intervalKm < LIMITS.intervalKmMin || intervalKm > LIMITS.intervalKmMax) {
      errors.intervalKm = `Entre ${formatKm(LIMITS.intervalKmMin)} et ${formatKm(LIMITS.intervalKmMax)}.`;
    }
    const lastKm = parseInteger(raw.lastKm);
    if (!Number.isInteger(lastKm) || lastKm < 0 || lastKm > LIMITS.odometerMax) errors.lastKm = 'Indiquez un kilométrage valide.';
    value = { ...value, intervalKm, lastKm };
  }

  if (kind === 'date') {
    const dueDate = typeof raw.dueDate === 'string' ? raw.dueDate.trim() : '';
    if (!isValidISODate(dueDate) || dueDate < LIMITS.minDate || dueDate > LIMITS.maxDate) errors.dueDate = 'Indiquez une date valide.';
    let intervalMonths = null;
    if (raw.intervalMonths !== '' && raw.intervalMonths != null) {
      intervalMonths = parseInteger(raw.intervalMonths);
      if (!Number.isInteger(intervalMonths) || intervalMonths < 1 || intervalMonths > LIMITS.intervalMonthsMax) {
        errors.intervalMonths = `Entre 1 et ${LIMITS.intervalMonthsMax} mois.`;
      }
    }
    value = { ...value, dueDate, intervalMonths };
  }

  return result(value, errors);
}

/** Préférences : seules les clés connues sont conservées. */
export function validateSettings(raw = {}) {
  const value = {};
  if (raw.unit === UNITS.L100 || raw.unit === UNITS.KML) value.unit = raw.unit;
  if (raw.firstName != null) value.firstName = cleanText(raw.firstName, LIMITS.firstNameMax);
  if (isSafeId(raw.activeVehicleId)) value.activeVehicleId = raw.activeVehicleId;
  return value;
}

/** Mot de passe d'une sauvegarde chiffrée. */
export function validatePassphrase(passphrase, confirmation = passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 10) return 'Au moins 10 caractères.';
  if (passphrase.length > 200) return '200 caractères maximum.';
  if (passphrase !== confirmation) return 'Les deux mots de passe ne correspondent pas.';
  return null;
}
