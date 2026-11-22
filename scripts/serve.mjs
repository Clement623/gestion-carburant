#!/usr/bin/env node
/**
 * Petit serveur local pour développer et tester l'application (aucune dépendance).
 *
 *   npm start            → http://localhost:8080
 *   PORT=3000 npm start  → autre port
 *
 * - N'écoute que sur la machine locale (127.0.0.1) par défaut.
 * - Applique les mêmes en-têtes de sécurité qu'en production (lus dans public/_headers).
 * - Bloque toute tentative de sortir du dossier public (« ../ »).
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Lit le fichier _headers (format Netlify / Cloudflare Pages). */
async function loadHeaderRules() {
  const rules = [];
  let current = null;
  const text = await readFile(join(ROOT, '_headers'), 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: {} };
      rules.push(current);
    } else if (current) {
      const index = line.indexOf(':');
      current.headers[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
  }
  return rules;
}

function headersFor(pathname, rules) {
  const headers = {};
  for (const { pattern, headers: values } of rules) {
    const matches = pattern.endsWith('/*') ? pathname.startsWith(pattern.slice(0, -1)) : pathname === pattern;
    if (matches) Object.assign(headers, values);
  }
  return headers;
}

const rules = await loadHeaderRules();

const server = createServer(async (request, response) => {
  const send = (status, body, headers = {}) => {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
    response.end(request.method === 'HEAD' ? undefined : body);
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(405, 'Méthode non autorisée', { Allow: 'GET, HEAD' });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    send(400, 'Requête invalide');
    return;
  }
  if (pathname.includes('\0')) {
    send(400, 'Requête invalide');
    return;
  }

  let filePath = resolve(ROOT, `.${pathname}`);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    send(403, 'Accès refusé');
    return;
  }
  if (pathname.split('/').some((part) => part.startsWith('_') || part.startsWith('.'))) {
    send(404, 'Introuvable'); // _headers et fichiers cachés ne sont pas servis
    return;
  }

  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html');
    const body = await readFile(filePath);
    const headers = headersFor(pathname, rules);
    response.writeHead(200, {
      'Content-Type': TYPES[extname(filePath)] ?? 'application/octet-stream',
      'Content-Length': body.length,
      ...headers,
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    send(404, 'Introuvable', headersFor(pathname, rules));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Suivi Carburant : http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}`);
});
