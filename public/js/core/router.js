/**
 * Routeur par « hash » : #/historique, #/plein/abc-123…
 *
 * Le hash ne quitte jamais le navigateur : n'importe quel hébergeur statique sert la même
 * page index.html (aucune règle de réécriture à configurer, compatible GitHub Pages).
 * Les paramètres d'URL sont filtrés (lettres, chiffres, tirets) avant d'atteindre un écran.
 */

const PARAM_VALUE = /^[A-Za-z0-9_-]{1,64}$/;

export function parsePath(hash) {
  let path = String(hash ?? '').replace(/^#/, '');
  try {
    path = decodeURIComponent(path);
  } catch {
    path = '/';
  }
  if (!path.startsWith('/')) path = `/${path}`;
  return path.replace(/\/+$/, '') || '/';
}

/** Trouve la première route qui correspond au chemin ; les routes fixes sont donc déclarées avant les routes à paramètre. */
export function matchRoute(routes, path) {
  const parts = path.split('/').filter(Boolean);
  for (const route of routes) {
    const pattern = route.path.split('/').filter(Boolean);
    if (pattern.length !== parts.length) continue;
    const params = {};
    const matches = pattern.every((segment, index) => {
      if (segment.startsWith(':')) {
        if (!PARAM_VALUE.test(parts[index])) return false;
        params[segment.slice(1)] = parts[index];
        return true;
      }
      return segment === parts[index];
    });
    if (matches) return { route, params };
  }
  return null;
}

export function createRouter(routes, { onChange, win = window }) {
  const resolve = () => {
    const path = parsePath(win.location.hash);
    onChange({ ...(matchRoute(routes, path) ?? { route: null, params: {} }), path });
  };

  return {
    start() {
      win.addEventListener('hashchange', resolve);
      resolve();
    },
    navigate(path, { replace = false } = {}) {
      const target = `#${path}`;
      if (replace) {
        win.history.replaceState(null, '', target);
        resolve();
      } else if (win.location.hash === target) {
        resolve();
      } else {
        win.location.hash = path;
      }
    },
  };
}
