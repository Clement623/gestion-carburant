/**
 * Table des routes. Les routes fixes (« nouveau ») sont déclarées AVANT les routes à paramètre (« :id »).
 * - tab  : onglet mis en évidence dans la barre du bas ;
 * - form : écran de saisie (barre d'onglets masquée, bouton d'enregistrement en bas).
 */

import { renderFillupForm } from './screens/fillup-form.js';
import { renderHistory } from './screens/history.js';
import { renderHome } from './screens/home.js';
import { renderReminderForm } from './screens/reminder-form.js';
import { renderStats } from './screens/stats.js';
import { renderVehicleForm } from './screens/vehicle-form.js';
import { renderVehicle } from './screens/vehicle.js';

export const routes = [
  { path: '/', title: 'Accueil', tab: 'home', render: renderHome },
  { path: '/historique', title: 'Historique', tab: 'history', render: renderHistory },
  { path: '/stats', title: 'Statistiques', tab: 'stats', render: renderStats },
  { path: '/vehicule', title: 'Véhicule', tab: 'vehicle', render: renderVehicle },
  { path: '/plein/nouveau', title: 'Nouveau plein', form: true, render: renderFillupForm },
  { path: '/plein/:id', title: 'Modifier le plein', form: true, render: renderFillupForm },
  { path: '/vehicule/nouveau', title: 'Nouveau véhicule', form: true, render: renderVehicleForm },
  { path: '/vehicule/:id', title: 'Modifier le véhicule', form: true, render: renderVehicleForm },
  { path: '/rappel/nouveau', title: 'Nouveau rappel', form: true, render: renderReminderForm },
  { path: '/rappel/:id', title: 'Modifier le rappel', form: true, render: renderReminderForm },
];
