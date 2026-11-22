/**
 * Constantes métier partagées par toute l'application.
 * Ce module n'a aucune dépendance : il est importé aussi bien par le navigateur que par les tests Node.
 */

export const APP_NAME = 'Suivi Carburant';
export const APP_VERSION = '1.0.0';

/** Carburants proposés. `short` sert aux boutons, `label` à l'affichage complet. */
export const FUEL_TYPES = Object.freeze([
  Object.freeze({ id: 'SP95', short: 'SP95', label: 'SP95' }),
  Object.freeze({ id: 'E10', short: 'E10', label: 'SP95-E10' }),
  Object.freeze({ id: 'SP98', short: 'SP98', label: 'SP98' }),
  Object.freeze({ id: 'E85', short: 'E85', label: 'E85' }),
  Object.freeze({ id: 'GAZOLE', short: 'Gazole', label: 'Gazole' }),
  Object.freeze({ id: 'GPL', short: 'GPL', label: 'GPL' }),
]);

export const FUEL_IDS = Object.freeze(FUEL_TYPES.map((fuel) => fuel.id));

export function fuelLabel(id) {
  return FUEL_TYPES.find((fuel) => fuel.id === id)?.label ?? String(id ?? '');
}

/** Unités d'affichage de la consommation. Le stockage est toujours en L/100 km. */
export const UNITS = Object.freeze({ L100: 'l100', KML: 'kml' });

/**
 * Bornes de validation. Elles bloquent les fautes de frappe (un zéro de trop)
 * et les valeurs absurdes qu'un fichier d'import modifié pourrait contenir.
 */
export const LIMITS = Object.freeze({
  minDate: '1990-01-01',
  maxDate: '2100-12-31',
  odometerMax: 2_000_000,
  litersMax: 300,
  priceMin: 0.2,
  priceMax: 5,
  totalMax: 2_000,
  tankMin: 5,
  tankMax: 200,
  targetMin: 1,
  targetMax: 40,
  nameMax: 40,
  modelMax: 60,
  plateMax: 15,
  stationMax: 80,
  labelMax: 40,
  firstNameMax: 30,
  intervalKmMin: 100,
  intervalKmMax: 300_000,
  intervalMonthsMax: 120,
});

/** Limites appliquées à un fichier de sauvegarde avant de l'importer. */
export const IMPORT_LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxVehicles: 50,
  maxFillups: 20_000,
  maxReminders: 500,
});

/** Nombre de mois pris en compte pour la consommation moyenne de l'accueil. */
export const DASHBOARD_MONTHS = 3;
