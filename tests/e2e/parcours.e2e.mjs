#!/usr/bin/env node
/**
 * Test de bout en bout dans un vrai navigateur (Chromium via Playwright).
 *
 *   npm install --no-save playwright && npx playwright install chromium
 *   npm run test:e2e                      (CHROME_PATH=/chemin/vers/chrome pour un Chrome existant)
 *
 * Parcours : premier lancement, ajout d'un véhicule et de pleins, erreurs de saisie, démo,
 * sauvegarde simple et chiffrée, effacement puis restauration, export CSV, tentative XSS,
 * fonctionnement hors ligne. Échoue au moindre message d'erreur ou violation de la CSP.
 * Les captures d'écran sont enregistrées dans captures/.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright').catch(() => import('playwright-core'));

const PORT = 8123;
const BASE = `http://localhost:${PORT}/`;
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = `${ROOT}captures/`;
const PASSWORD = 'pompe à essence 2026';

const isoDaysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

async function startServer() {
  const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (chunk) => { if (String(chunk).includes('http://')) resolve(); });
    server.on('error', reject);
    setTimeout(() => reject(new Error('Le serveur ne démarre pas')), 5000);
  });
  return server;
}

const step = (label) => console.log(`• ${label}`);

const server = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: 'fr-FR',
  timezoneId: 'Europe/Paris',
  acceptDownloads: true,
});
const page = await context.newPage();
const problems = [];
const dialogs = [];
page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) problems.push(`${message.type()} : ${message.text()}`);
});
page.on('pageerror', (error) => problems.push(`exception : ${error.message}`));
page.on('dialog', async (dialog) => {
  dialogs.push(dialog.message());
  await dialog.dismiss();
});
await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (event) => {
    console.error(`Violation CSP : ${event.violatedDirective} ${event.blockedURI}`);
  });
});
await mkdir(SHOTS, { recursive: true });
/** Capture d'écran sans messages éphémères ; `tall` agrandit la fenêtre pour montrer tout l'écran. */
async function shot(name, tall = false) {
  await page.evaluate(() => document.getElementById('toasts')?.replaceChildren());
  await page.mouse.move(1, 1);
  if (tall) {
    const height = await page.evaluate(() => Math.max(844, document.documentElement.scrollHeight));
    await page.setViewportSize({ width: 390, height });
  }
  await page.screenshot({ path: `${SHOTS}${name}.png` });
  if (tall) await page.setViewportSize({ width: 390, height: 844 });
}
const heading = (name) => page.getByRole('heading', { level: 1, name });

try {
  step('Premier lancement et en-têtes de sécurité');
  const response = await page.goto(BASE);
  const headers = response.headers();
  assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(headers['content-security-policy'], /require-trusted-types-for 'script'/);
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'no-referrer');
  await heading('Bienvenue').waitFor();
  await shot('01-bienvenue');

  step('Ajout du véhicule');
  await page.getByRole('link', { name: 'Ajouter mon véhicule' }).click();
  await heading('Nouveau véhicule').waitFor();
  await page.getByRole('button', { name: 'Ajouter le véhicule' }).click();
  assert.equal(await page.locator('#v-name-error').textContent(), 'Donnez un nom au véhicule.');
  await page.fill('#v-name', 'Clio test');
  await page.fill('#v-tank', '45');
  await page.fill('#v-target', '6');
  await page.getByRole('button', { name: 'Ajouter le véhicule' }).click();
  await heading('Bonjour').waitFor();

  step('Trois pleins, calcul automatique du montant et aperçu de consommation');
  await page.getByRole('link', { name: 'Ajouter un plein' }).click();
  await heading('Nouveau plein').waitFor();
  await page.fill('#f-date', isoDaysAgo(20));
  await page.fill('#f-km', '10000');
  await page.fill('#f-liters', '40');
  await page.fill('#f-price', '1,80');
  assert.equal(await page.inputValue('#f-total'), '72,00');
  await page.getByRole('button', { name: 'Enregistrer le plein' }).click();
  await heading('Historique').waitFor();

  await page.getByRole('link', { name: 'Ajouter un plein' }).click();
  await page.fill('#f-date', isoDaysAgo(10));
  await page.fill('#f-km', '10 600');
  await page.fill('#f-liters', '38,5');
  await page.fill('#f-price', '1,759');
  await page.getByText('600 km parcourus').waitFor();
  assert.match(await page.locator('.preview-value').textContent(), /6,4/);
  await shot('04-nouveau-plein', true);
  await page.getByRole('button', { name: 'Enregistrer le plein' }).click();
  await heading('Historique').waitFor();

  step('Erreur de saisie : compteur qui recule');
  await page.getByRole('link', { name: 'Ajouter un plein' }).click();
  await page.fill('#f-date', isoDaysAgo(1));
  await page.fill('#f-km', '10500');
  await page.fill('#f-liters', '39');
  await page.fill('#f-total', '70');
  assert.equal(await page.inputValue('#f-price'), '1,795');
  await page.getByRole('button', { name: 'Enregistrer le plein' }).click();
  await page.getByText(/Doit dépasser 10.600.km/).waitFor();
  assert.equal(await page.getAttribute('#f-km', 'aria-invalid'), 'true');
  await shot('10-erreur-saisie');
  await page.fill('#f-km', '11210');
  await page.fill('#f-station', '<img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: 'Enregistrer le plein' }).click();
  await heading('Historique').waitFor();
  assert.equal(await page.locator('.fillup-row').count(), 3);
  await page.getByText('<img src=x onerror=alert(1)>', { exact: false }).first().waitFor();
  assert.equal(await page.locator('img[src="x"]').count(), 0);

  step('Accueil avec mes propres pleins');
  await page.getByRole('link', { name: 'Accueil' }).click();
  await heading('Bonjour').waitFor();
  assert.match(await page.locator('.hero-number').textContent(), /^6,\d$/);

  step('Données de démonstration');
  await page.getByRole('link', { name: 'Véhicule', exact: true }).click();
  await page.getByRole('button', { name: 'Charger les données de démonstration' }).click();
  await page.getByRole('button', { name: 'Remplacer par la démo' }).click();
  await heading('Bonjour').waitFor();
  await page.getByText('Ma voiture (démo)').first().waitFor();
  await shot('02-accueil', true);

  await page.getByRole('link', { name: 'Historique' }).click();
  await heading('Historique').waitFor();
  await shot('05-historique');
  await page.getByRole('button', { name: 'Ce mois' }).click();
  assert.equal(await page.getByRole('button', { name: 'Ce mois' }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Tout' }).click();

  await page.getByRole('link', { name: 'Stats' }).click();
  await heading('Statistiques').waitFor();
  await shot('06-statistiques', true);
  await page.getByRole('button', { name: '1 an' }).click();
  await shot('07-statistiques-1-an', true);

  await page.getByRole('link', { name: 'Véhicule', exact: true }).click();
  await heading('Véhicule').waitFor();
  await shot('08-vehicule', true);
  await page.getByRole('link', { name: /Vidange/ }).click();
  await heading('Modifier le rappel').waitFor();
  await shot('09-rappel');
  await page.getByRole('link', { name: 'Retour' }).click();

  step('Unité km/L');
  await page.getByRole('button', { name: 'km/L' }).click();
  await page.getByRole('link', { name: 'Accueil' }).click();
  await page.locator('.hero-unit', { hasText: 'km/L' }).waitFor();
  await page.getByRole('link', { name: 'Véhicule', exact: true }).click();
  await page.getByRole('button', { name: 'L/100 km' }).click();

  step('Sauvegarde simple puis chiffrée');
  let download = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Sauvegarder Fichier JSON/ }).click();
  const plain = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  assert.equal(plain.format, 'suivi-carburant/sauvegarde');
  assert.ok(plain.data.fillups.length >= 14);

  download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Sauvegarder avec un mot de passe/ }).click();
  await page.fill('input[autocomplete="new-password"] >> nth=0', PASSWORD);
  await page.fill('input[autocomplete="new-password"] >> nth=1', PASSWORD);
  await shot('11-mot-de-passe');
  await page.getByRole('button', { name: 'Chiffrer et télécharger' }).click();
  const encryptedFile = await (await download).path();
  const encrypted = JSON.parse(await readFile(encryptedFile, 'utf8'));
  assert.equal(encrypted.format, 'suivi-carburant/sauvegarde-chiffree');
  assert.equal(JSON.stringify(encrypted).includes('Ma voiture'), false);

  step('Effacement puis restauration de la sauvegarde chiffrée');
  await page.getByRole('button', { name: 'Effacer toutes les données' }).click();
  await page.getByRole('button', { name: 'Tout effacer' }).click();
  await heading('Bienvenue').waitFor();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restaurer une sauvegarde' }).click();
  await (await chooser).setFiles(encryptedFile);
  await page.fill('input[autocomplete="current-password"]', 'mauvais mot de passe');
  await page.getByRole('button', { name: 'Déchiffrer' }).click();
  await page.getByText(/Mot de passe incorrect/).waitFor();
  const chooser2 = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restaurer une sauvegarde' }).click();
  await (await chooser2).setFiles(encryptedFile);
  await page.fill('input[autocomplete="current-password"]', PASSWORD);
  await page.getByRole('button', { name: 'Déchiffrer' }).click();
  await page.getByRole('button', { name: 'Remplacer mes données' }).click();
  await heading('Bonjour').waitFor();
  await page.getByText('Ma voiture (démo)').first().waitFor();

  step('Export CSV');
  await page.getByRole('link', { name: 'Historique' }).click();
  download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter en CSV pour un tableur' }).click();
  const csv = await readFile(await (await download).path(), 'utf8');
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /^.Date;Véhicule;Compteur \(km\)/);

  step('Fonctionnement hors ligne (service worker)');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await heading('Historique').waitFor();
  await page.getByRole('link', { name: 'Stats' }).click();
  await heading('Statistiques').waitFor();
  await context.setOffline(false);

  assert.deepEqual(dialogs, [], 'aucune alerte JavaScript ne doit s’ouvrir (XSS)');
  const unexpected = problems.filter((text) => !/ERR_INTERNET_DISCONNECTED/.test(text));
  assert.deepEqual(unexpected, [], 'aucune erreur ni violation de sécurité dans la console');
  console.log(`\nParcours réussi. Captures : ${SHOTS}`);
} catch (error) {
  await page.screenshot({ path: `${SHOTS}echec.png` }).catch(() => {});
  console.error('\nÉCHEC :', error.message);
  if (problems.length) console.error('Console :', problems);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
