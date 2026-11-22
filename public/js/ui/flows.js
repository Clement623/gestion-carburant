/**
 * Parcours en plusieurs étapes partagés entre écrans : sauvegarder, restaurer, exporter,
 * charger la démo, tout effacer. Chacun enchaîne dialogues, action de l'appli et message final.
 */

import { IMPORT_LIMITS } from '../domain/constants.js';
import { plural } from '../domain/numbers.js';
import { cryptoAvailable } from '../data/crypto.js';
import { alertDialog, confirmDialog, passwordDialog } from './components/dialog.js';
import { downloadFile, pickFile } from './files.js';

function reportError(ctx, error, fallback) {
  // Erreurs « attendues » (fichier invalide, mauvais mot de passe…) : message clair, pas de trace technique.
  const known = ['BackupError', 'CryptoError', 'StorageError'].includes(error?.name);
  if (!known) console.error(error);
  if (error?.details?.length) {
    alertDialog({ title: error.message, details: error.details });
    return;
  }
  ctx.toast(known ? error.message : fallback, { tone: 'error' });
}

export async function backupFlow(ctx, { encrypted = false } = {}) {
  try {
    let passphrase = null;
    if (encrypted) {
      if (!cryptoAvailable()) {
        ctx.toast('Le chiffrement nécessite une connexion HTTPS.', { tone: 'error' });
        return;
      }
      passphrase = await passwordDialog({
        title: 'Sauvegarde protégée',
        message: 'Choisissez un mot de passe d’au moins 10 caractères. Notez-le : sans lui, la sauvegarde ne pourra pas être restaurée.',
        confirm: true,
        submitLabel: 'Chiffrer et télécharger',
      });
      if (!passphrase) return;
      ctx.toast('Chiffrement en cours…');
    }
    downloadFile(await ctx.app.exportBackup({ passphrase }));
    ctx.toast(encrypted ? 'Sauvegarde chiffrée téléchargée.' : 'Sauvegarde téléchargée.');
    ctx.rerender();
  } catch (error) {
    reportError(ctx, error, 'La sauvegarde a échoué.');
  }
}

export async function restoreFlow(ctx) {
  const file = await pickFile({ accept: 'application/json,.json' });
  if (!file) return;
  if (file.size > IMPORT_LIMITS.maxBytes) {
    ctx.toast('Fichier trop volumineux (5 Mo maximum).', { tone: 'error' });
    return;
  }
  try {
    let backup = ctx.app.readBackup(await file.text());
    if (backup.encrypted) {
      const passphrase = await passwordDialog({
        title: 'Sauvegarde protégée',
        message: 'Saisissez le mot de passe choisi lors de la sauvegarde.',
        submitLabel: 'Déchiffrer',
      });
      if (!passphrase) return;
      backup = await ctx.app.decryptBackup(backup.envelope, passphrase);
    }
    const { counts } = backup;
    const confirmed = await confirmDialog({
      title: 'Restaurer cette sauvegarde ?',
      message: `Elle contient ${plural(counts.vehicles, 'véhicule')}, ${plural(counts.fillups, 'plein')} et ${plural(counts.reminders, 'rappel')}. Les données actuelles de cet appareil seront remplacées.`,
      confirmLabel: 'Remplacer mes données',
      danger: true,
    });
    if (!confirmed) return;
    await ctx.app.importBackup(backup.data);
    ctx.toast('Sauvegarde restaurée.');
    ctx.navigate('/');
  } catch (error) {
    reportError(ctx, error, 'Impossible de lire ce fichier.');
  }
}

export async function csvFlow(ctx) {
  try {
    if (ctx.app.state.vehicles.length === 0) {
      ctx.toast('Aucune donnée à exporter pour l’instant.');
      return;
    }
    downloadFile(await ctx.app.exportCsv());
    ctx.toast('Fichier CSV téléchargé (ouvrable avec Excel ou LibreOffice).');
  } catch (error) {
    reportError(ctx, error, 'L’export a échoué.');
  }
}

export async function demoFlow(ctx) {
  if (ctx.app.state.vehicles.length > 0) {
    const confirmed = await confirmDialog({
      title: 'Charger la démonstration ?',
      message: 'Les données de démonstration remplaceront toutes vos données actuelles. Faites d’abord une sauvegarde si besoin.',
      confirmLabel: 'Remplacer par la démo',
      danger: true,
    });
    if (!confirmed) return;
  }
  try {
    await ctx.app.loadDemo();
    ctx.toast('Données de démonstration chargées.');
    ctx.navigate('/');
  } catch (error) {
    reportError(ctx, error, 'Impossible de charger la démonstration.');
  }
}

export async function clearFlow(ctx) {
  const confirmed = await confirmDialog({
    title: 'Effacer toutes les données ?',
    message: 'Véhicules, pleins, rappels et préférences seront supprimés de cet appareil. Cette action est définitive.',
    confirmLabel: 'Tout effacer',
    danger: true,
  });
  if (!confirmed) return;
  try {
    await ctx.app.clearAll();
    ctx.toast('Toutes les données ont été effacées.');
    ctx.navigate('/');
  } catch (error) {
    reportError(ctx, error, 'L’effacement a échoué.');
  }
}
