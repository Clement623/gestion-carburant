/**
 * Données de démonstration : un véhicule, environ huit mois de pleins et trois rappels,
 * calculés à partir de la date du jour. Les valeurs sont fictives.
 *
 * Le générateur est déterministe (graine fixe) : la démo est identique à chaque chargement,
 * ce qui permet aussi de l'utiliser dans les tests.
 */

import { addDays, addMonths } from './dates.js';
import { round } from './numbers.js';

function mulberry32(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const STATIONS = ['Station du Centre', 'Relais des Lilas', 'Station de la Gare', 'Aire du Moulin'];

export function buildDemoData({ today, newId, now = Date.now() }) {
  const random = mulberry32(2026);
  const vehicleId = newId();
  const vehicle = {
    id: vehicleId,
    name: 'Ma voiture (démo)',
    model: 'Citadine essence',
    plate: 'AB-123-CD',
    fuelType: 'E10',
    tankCapacity: 45,
    consumptionTarget: 6.5,
    createdAt: now,
    updatedAt: now,
  };

  const fillups = [];
  let date = addDays(today, -240);
  let odometer = 41_250;
  let burned = 0; // carburant consommé depuis le dernier plein complet
  const tank = vehicle.tankCapacity;
  for (let index = 0; date <= addDays(today, -2); index += 1) {
    const month = Number(date.slice(5, 7));
    const summer = month === 7 || month === 8; // trajets de vacances : plus d'autoroute
    const l100 = 6.1 + random() * 0.6 + (summer ? 0.5 : 0);
    const isFull = index === 0 || index % 7 !== 4; // un plein partiel de temps en temps, plus tôt dans le trajet
    const wanted = isFull ? 470 + random() * 130 : 330 + random() * 80;
    const reachable = ((tank * 0.93 - burned) / l100) * 100; // on ne roule jamais plus que le réservoir le permet
    const distance = Math.round(Math.min(wanted, reachable));
    odometer += distance;
    burned += (distance * l100) / 100;

    let liters = isFull ? burned : Math.min(burned, 12 + random() * 5);
    liters = round(liters, 2);
    burned = isFull ? 0 : burned - liters;

    const pricePerLiter = round(1.72 + random() * 0.12 + (summer ? 0.04 : 0), 3);
    fillups.push({
      id: newId(),
      vehicleId,
      date,
      odometer,
      liters,
      pricePerLiter,
      totalCost: round(liters * pricePerLiter, 2),
      fuelType: 'E10',
      isFull,
      station: STATIONS[index % STATIONS.length],
      createdAt: now,
      updatedAt: now,
    });
    date = addDays(date, 12 + Math.floor(random() * 6));
  }

  const lastKm = fillups.at(-1)?.odometer ?? odometer;
  const reminders = [
    { label: 'Vidange', kind: 'km', intervalKm: 15_000, lastKm: lastKm - 12_320, dueDate: null, intervalMonths: null },
    { label: 'Contrôle technique', kind: 'date', intervalKm: null, lastKm: null, dueDate: addMonths(today, 4), intervalMonths: 24 },
    { label: 'Pression des pneus', kind: 'date', intervalKm: null, lastKm: null, dueDate: addDays(today, -5), intervalMonths: 1 },
  ].map((reminder) => ({ ...reminder, id: newId(), vehicleId, createdAt: now, updatedAt: now }));

  return {
    vehicles: [vehicle],
    fillups,
    reminders,
    settings: { activeVehicleId: vehicleId },
  };
}
