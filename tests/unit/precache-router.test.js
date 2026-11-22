/**
 * Vérifie que le service worker met bien en cache CHAQUE fichier publié (sinon l'appli
 * casserait hors ligne), et que le routeur filtre correctement les adresses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchRoute, parsePath } from '../../public/js/core/router.js';

const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));
const NOT_CACHED = new Set(['sw.js', '_headers', 'assets/fonts/LICENSE-Inter.txt', 'assets/fonts/LICENSE-SpaceGrotesk.txt']);

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => (entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)])));
  return files.flat();
}

test('le service worker met en cache tous les fichiers publiés, et seulement eux', async () => {
  const source = await readFile(join(PUBLIC, 'sw.js'), 'utf8');
  const list = source.slice(source.indexOf('const ASSETS = ['), source.indexOf('];', source.indexOf('const ASSETS = [')));
  const cached = new Set([...list.matchAll(/'\.\/([^']*)'/g)].map((match) => match[1]).filter(Boolean));
  const published = (await listFiles(PUBLIC)).map((file) => relative(PUBLIC, file).split(sep).join('/')).filter((file) => !NOT_CACHED.has(file));
  for (const file of published) assert.ok(cached.has(file), `${file} manque dans la liste du service worker`);
  for (const file of cached) assert.ok(published.includes(file), `${file} est listé mais n'existe pas`);
  assert.match(source, /'\.\/',/);
});

test('aucun fichier publié n’utilise innerHTML, eval ou des gestionnaires en ligne', async () => {
  const files = (await listFiles(PUBLIC)).filter((file) => /\.(js|html)$/.test(file));
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const code = text.replace(/^\s*(\*|\/\/).*$/gm, ''); // ignore les commentaires
    assert.doesNotMatch(code, /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/, file);
    assert.doesNotMatch(code, /\son[a-z]+=["']/i, `${file} contient un gestionnaire d'événement en ligne`);
  }
});

test('routeur : correspondance et filtrage des paramètres', () => {
  const routes = [
    { path: '/' },
    { path: '/plein/nouveau' },
    { path: '/plein/:id' },
  ];
  assert.equal(parsePath(''), '/');
  assert.equal(parsePath('#/historique/'), '/historique');
  assert.equal(parsePath('#%E0%A4%A'), '/');
  assert.equal(matchRoute(routes, '/').route.path, '/');
  assert.equal(matchRoute(routes, '/plein/nouveau').route.path, '/plein/nouveau');
  assert.deepEqual(matchRoute(routes, '/plein/3f2a9c1e-5b7d').params, { id: '3f2a9c1e-5b7d' });
  assert.equal(matchRoute(routes, '/plein/<script>'), null);
  assert.equal(matchRoute(routes, '/plein/..%2F..'), null);
  assert.equal(matchRoute(routes, '/inconnu'), null);
});
