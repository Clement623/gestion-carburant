/**
 * Enregistrement du service worker (mode hors ligne) et gestion des mises à jour.
 *
 * Quand une nouvelle version est publiée, le navigateur la télécharge en arrière-plan.
 * On propose alors « Mettre à jour » : la nouvelle version ne prend la main qu'avec l'accord
 * de l'utilisateur, pour ne jamais mélanger deux versions pendant une saisie.
 */

const SW_URL = './sw.js';

/** Avec les Trusted Types actifs (CSP), l'URL du service worker doit passer par une politique déclarée. */
function trustedWorkerUrl() {
  if (!globalThis.trustedTypes?.createPolicy) return SW_URL;
  const policy = globalThis.trustedTypes.createPolicy('sw-url', {
    createScriptURL(url) {
      if (url === SW_URL) return url;
      throw new TypeError('Adresse de service worker refusée.');
    },
  });
  return policy.createScriptURL(SW_URL);
}

export function registerServiceWorker({ onUpdateReady }) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  let reloading = false;
  let userAccepted = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!userAccepted || reloading) return;
    reloading = true;
    window.location.reload();
  });

  const offerUpdate = (worker) => {
    onUpdateReady(() => {
      userAccepted = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  };

  navigator.serviceWorker.register(trustedWorkerUrl(), { scope: './' }).then((registration) => {
    if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
  }).catch((error) => {
    console.warn('Mode hors ligne indisponible :', error);
  });
}
