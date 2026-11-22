/**
 * Point d'entrée : ouvre la base, crée l'appli, branche le routeur et affiche l'écran demandé.
 *
 * Cycle de rendu : à chaque changement de route (ou après une action via ctx.rerender()),
 * l'écran courant est reconstruit entièrement à partir de l'état de l'appli. Simple et prévisible :
 * pas de copie d'état cachée dans l'interface.
 */

import { createApp } from './app.js';
import { createRouter } from './core/router.js';
import { h } from './core/dom.js';
import { registerServiceWorker } from './core/sw-register.js';
import { openDatabase } from './data/db.js';
import { createRepositories } from './data/repositories.js';
import { notFound } from './ui/components/common.js';
import { renderTabbar } from './ui/components/tabbar.js';
import { showToast } from './ui/components/toast.js';
import { routes } from './ui/routes.js';

const main = document.getElementById('main');
const nav = document.getElementById('tabbar');
const MAIN_TABS = new Set(['/', '/historique', '/stats', '/vehicule']);

/** Installation de l'appli (Android / ordinateur : invite native ; iPhone : explication). */
function createInstallHelper() {
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
  });
  return {
    isInstalled: () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    canPrompt: () => deferredPrompt !== null,
    isIos: () => /iphone|ipad|ipod/i.test(navigator.userAgent),
    async prompt() {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    },
  };
}

/** Demande au navigateur de ne pas effacer les données automatiquement en cas de manque de place. */
async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // facultatif : certains navigateurs ne le proposent pas
  }
}

async function storageStatus() {
  try {
    const persisted = await navigator.storage?.persisted?.();
    if (persisted === true) return 'Stockage protégé contre l’effacement automatique';
    if (persisted === false) return 'Stockage standard (pensez aux sauvegardes)';
  } catch {
    // ignoré
  }
  return 'État du stockage inconnu';
}

function renderFatal(error) {
  console.error(error);
  main.replaceChildren(h('div', { class: 'stack' },
    h('h1', { class: 'title' }, 'Démarrage impossible'),
    h('div', { class: 'card stack-2' },
      h('p', {}, error?.name === 'StorageError' ? error.message : 'Une erreur inattendue empêche l’application de démarrer.'),
      h('p', { class: 'muted' }, 'Essayez de recharger la page. En navigation privée, ouvrez l’application dans une fenêtre normale.'))));
  nav.hidden = true;
}

async function boot() {
  // Anti-« clickjacking » : l'appli refuse de fonctionner dans un cadre (iframe) d'un autre site.
  // Les hébergeurs qui lisent _headers ajoutent la même protection côté serveur (frame-ancestors).
  if (window.self !== window.top) {
    renderFatal(new Error('Application ouverte dans un cadre.'));
    main.querySelector('.card p').textContent = 'Pour votre sécurité, ouvrez Suivi Carburant directement dans le navigateur.';
    return;
  }

  let app;
  try {
    const db = await openDatabase({
      onVersionChange: () => showToast('L’application a été mise à jour dans un autre onglet : rechargez cette page.', { tone: 'error' }),
    });
    app = createApp({ repos: createRepositories(db) });
    await app.load();
  } catch (error) {
    renderFatal(error);
    return;
  }

  const install = createInstallHelper();
  let current = null;
  let lastTab = '/';
  let persistenceRequested = false;

  const router = createRouter(routes, {
    onChange(match) {
      const routeChanged = current?.path !== match.path;
      current = match;
      if (MAIN_TABS.has(match.path)) lastTab = match.path;
      render(routeChanged);
    },
  });

  const context = (params) => ({
    app,
    params,
    navigate: router.navigate,
    rerender: () => render(false),
    toast: showToast,
    backPath: () => lastTab,
    install,
    storageStatus,
    onFirstSave() {
      if (persistenceRequested) return;
      persistenceRequested = true;
      requestPersistence();
    },
  });

  function render(routeChanged) {
    const route = current.route;
    // Mémorise l'élément actif pour lui rendre le focus après un rendu sur place (filtres, choix d'unité…).
    const focusKey = routeChanged ? null : document.activeElement?.dataset?.focusKey;
    let screen;
    try {
      screen = route ? route.render(context(current.params)) : notFound();
    } catch (error) {
      console.error(error);
      screen = notFound('Cet écran n’a pas pu s’afficher.');
    }
    main.replaceChildren(screen);
    main.classList.toggle('screen-form', Boolean(route?.form));
    nav.hidden = Boolean(route?.form);
    renderTabbar(nav, route?.tab ?? null);

    if (routeChanged) {
      document.title = `${route?.title ?? 'Introuvable'} · Suivi Carburant`;
      window.scrollTo(0, 0);
      main.querySelector('h1')?.focus({ preventScroll: true });
    } else if (focusKey) {
      main.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    }
  }

  window.addEventListener('unhandledrejection', (event) => {
    console.error(event.reason);
    showToast('Une erreur inattendue est survenue.', { tone: 'error' });
  });

  router.start();
  registerServiceWorker({
    onUpdateReady: (apply) => showToast('Une nouvelle version est disponible.', { action: { label: 'Mettre à jour', onClick: apply } }),
  });
}

boot();
