# Architecture du code — Suivi Carburant

Suivi Carburant est une **application web progressive (PWA) « locale d'abord »** : tout le code
s'exécute dans le navigateur, les données sont enregistrées dans la base IndexedDB de l'appareil,
et le site publié n'est qu'un dossier de fichiers statiques (`public/`). Il n'y a ni serveur
applicatif, ni base de données en ligne, ni bibliothèque JavaScript tierce à l'exécution.

## 1. Vue d'ensemble

```
┌──────────────────────────── Navigateur de l'utilisateur ────────────────────────────┐
│                                                                                      │
│   index.html + css/          main.js (démarrage, rendu, routeur)                     │
│                                                                                      │
│   ┌──────────────┐  actions   ┌───────────────┐  lecture /    ┌──────────────────┐   │
│   │  Interface   │ ─────────▶ │  Application  │  écriture     │     Données      │   │
│   │  ui/ core/   │            │    app.js     │ ────────────▶ │      data/       │   │
│   │  écrans,     │ ◀───────── │ état + actions│ ◀──────────── │ IndexedDB, JSON, │   │
│   │  composants  │   état     └───────┬───────┘               │ chiffrement, CSV │   │
│   └──────┬───────┘                    │                       └────────┬─────────┘   │
│          │      calculs, formats,     ▼     validation                 │             │
│          └──────────────────▶ ┌───────────────┐ ◀──────────────────────┘             │
│                               │    Domaine    │  règles métier pures                 │
│                               │    domain/    │  (aucun accès écran ni stockage)     │
│                               └───────────────┘                                      │
│                                                                                      │
│   sw.js (service worker) : met tous les fichiers en cache → fonctionne hors ligne    │
└──────────────────────────────────────────────────────────────────────────────────────┘
                 ▲
                 │ une seule fois, puis à chaque mise à jour : fichiers statiques (HTTPS)
        Hébergeur gratuit : GitHub Pages, Netlify ou Cloudflare Pages
```

**Règle de dépendance** : `ui → app → data → domain`. Le domaine ne dépend de rien ;
les données ne connaissent pas l'interface ; l'interface n'écrit jamais directement dans la base.
Cette séparation rend chaque couche testable seule et remplaçable (par exemple, ajouter une
synchronisation en ligne ne toucherait que `data/`).

## 2. Arborescence

```
suivi-carburant/
├── public/                      ← le site publié, tel quel
│   ├── index.html               coquille de l'appli + politique de sécurité (CSP)
│   ├── manifest.webmanifest     nom, icônes, couleurs : rend l'appli installable
│   ├── sw.js                    service worker : cache hors ligne et mises à jour
│   ├── _headers                 en-têtes de sécurité HTTP (Netlify, Cloudflare Pages)
│   ├── css/
│   │   ├── tokens.css           couleurs, polices, rayons (repris des maquettes)
│   │   ├── base.css             polices auto-hébergées, remise à zéro, mise en page
│   │   ├── components.css       cartes, boutons, champs, onglets, dialogues, graphiques
│   │   └── screens.css          styles propres à chaque écran
│   ├── js/
│   │   ├── main.js              démarrage : base, appli, routeur, rendu, service worker
│   │   ├── app.js               couche application : état + actions
│   │   ├── core/                outils génériques
│   │   │   ├── dom.js           construction sûre du DOM (h, svg), sans innerHTML
│   │   │   ├── router.js        routes par #hash, filtrage des paramètres
│   │   │   └── sw-register.js   enregistrement du service worker, proposition de mise à jour
│   │   ├── domain/              règles métier (fonctions pures, testées sous Node)
│   │   │   ├── constants.js     carburants, bornes de validation, limites d'import
│   │   │   ├── numbers.js       lecture/affichage des nombres en français
│   │   │   ├── dates.js         dates AAAA-MM-JJ, mois, affichage en français
│   │   │   ├── consumption.js   calcul de consommation de plein à plein
│   │   │   ├── stats.js         totaux par période, séries mensuelles, tableau de bord
│   │   │   ├── validation.js    validation et nettoyage de toutes les entrées
│   │   │   ├── reminders.js     rappels d'entretien : échéances, progression
│   │   │   └── demo.js          données de démonstration réalistes
│   │   ├── data/                stockage et fichiers
│   │   │   ├── db.js            IndexedDB : ouverture, migrations, transactions
│   │   │   ├── repositories.js  dépôts : seule porte d'accès aux données
│   │   │   ├── backup.js        sauvegarde JSON et import vérifié
│   │   │   ├── crypto.js        sauvegarde chiffrée (PBKDF2 + AES-256-GCM)
│   │   │   ├── csv.js           export tableur protégé contre les formules
│   │   │   └── ids.js           identifiants uniques (UUID v4)
│   │   └── ui/                  interface
│   │       ├── routes.js        table des routes → écrans
│   │       ├── flows.js         parcours : sauvegarder, restaurer, démo, tout effacer
│   │       ├── files.js         téléchargement et choix de fichier
│   │       ├── components/      icônes, champs, dialogues, messages, graphiques, onglets
│   │       └── screens/         accueil, plein, historique, stats, véhicule, rappel
│   └── assets/                  polices (Inter, Space Grotesk) et icônes de l'appli
├── tests/
│   ├── unit/                    domaine, routeur, cache hors ligne, interdits de sécurité
│   ├── integration/             appli + stockage IndexedDB (simulé) + sauvegardes
│   └── e2e/                     parcours complet dans Chrome (Playwright)
├── scripts/serve.mjs            serveur local avec les mêmes en-têtes qu'en production
├── .github/workflows/           tests automatiques et publication GitHub Pages
├── netlify.toml                 configuration Netlify (dossier publié)
└── package.json                 scripts npm ; une seule dépendance, pour les tests
```

## 3. Les couches en détail

### Domaine (`js/domain/`)

Des fonctions pures : mêmes entrées, mêmes sorties, aucun accès à l'écran, au stockage ou à
l'heure système (la date du jour est toujours passée en paramètre). C'est là que vivent les
règles qui font la valeur de l'appli :

- **`consumption.js`** calcule la consommation par la méthode de plein à plein (section 5) ;
- **`stats.js`** agrège dépenses, litres, distance et consommation par période ;
- **`validation.js`** contrôle chaque saisie et reconstruit un objet propre champ par champ ;
- **`numbers.js` / `dates.js`** lisent « 38,2 » ou « 48 320 » et affichent au format français.

### Données (`js/data/`)

- **`db.js`** enveloppe IndexedDB dans des promesses. Chaque opération est une transaction :
  la promesse n'est résolue qu'à l'événement `complete`, quand les données sont réellement écrites.
  Les évolutions de structure passent par des migrations numérotées (`MIGRATIONS[1]`, `[2]`…).
- **`repositories.js`** expose `vehicles`, `fillups`, `reminders`, `settings` avec `list`, `get`,
  `save`, `remove`. Le reste du code ignore tout d'IndexedDB.
- **`backup.js`, `crypto.js`, `csv.js`** produisent et lisent les fichiers d'échange.

Modèle de données (base `suivi-carburant`, version 1) :

| Magasin | Clé | Index | Champs |
| --- | --- | --- | --- |
| `vehicles` | `id` | — | `name`, `model`, `plate`, `fuelType`, `tankCapacity`, `consumptionTarget`, `createdAt`, `updatedAt` |
| `fillups` | `id` | `byVehicle` | `vehicleId`, `date` (AAAA-MM-JJ), `odometer` (km), `liters`, `pricePerLiter`, `totalCost`, `fuelType`, `isFull`, `station` |
| `reminders` | `id` | `byVehicle` | `vehicleId`, `label`, `kind` (`km`/`date`), `intervalKm`, `lastKm`, `dueDate`, `intervalMonths` |
| `settings` | `key` | — | `activeVehicleId`, `unit`, `firstName`, `lastBackupAt` |

### Application (`js/app.js`)

`createApp({ repos })` renvoie l'état courant (véhicules, véhicule actif, ses pleins et rappels,
préférences, analyse de consommation) et les actions : `saveFillup`, `deleteVehicle`,
`exportBackup`, `importBackup`… Chaque action suit le même schéma : **valider → enregistrer →
recharger l'état**. Ce module ne touche pas au DOM ; les tests d'intégration le pilotent directement.

### Interface (`js/core/`, `js/ui/`)

- **Rendu** : `main.js` reconstruit l'écran courant à chaque changement de route ou après une
  action (`ctx.rerender()`). L'état n'est jamais dupliqué dans l'interface, donc jamais désynchronisé.
  Le focus est rendu à l'élément actif après un rendu sur place, et placé sur le titre à chaque
  changement d'écran (lecteurs d'écran).
- **`dom.js`** construit tous les éléments avec `h('p', { class: 'x' }, texte)`. Le texte devient
  toujours un nœud texte : une donnée saisie ne peut jamais être interprétée comme du HTML.
- **Écrans** : chaque fichier de `screens/` exporte `render(ctx)` et renvoie un élément.
  `ctx` fournit `app`, `params`, `navigate`, `rerender`, `toast`.

Routes :

| Adresse | Écran |
| --- | --- |
| `#/` | Accueil (ou Bienvenue sans véhicule) |
| `#/historique` | Historique des pleins |
| `#/stats` | Statistiques 6 mois / 1 an |
| `#/vehicule` | Véhicule, rappels, préférences, données |
| `#/plein/nouveau`, `#/plein/:id` | Saisie / modification d'un plein |
| `#/vehicule/nouveau`, `#/vehicule/:id` | Saisie / modification d'un véhicule |
| `#/rappel/nouveau`, `#/rappel/:id` | Saisie / modification d'un rappel |

Le routage par `#hash` ne demande aucune règle de réécriture côté hébergeur : la même page
`index.html` sert toutes les adresses, ce qui le rend compatible avec GitHub Pages.

## 4. Exemple de flux : enregistrer un plein

1. L'utilisateur touche **+** : la route `#/plein/nouveau` affiche `fillup-form.js`.
2. Pendant la saisie, le montant se calcule (litres × prix) et `previewFillup()` affiche la
   distance parcourue et la consommation que donnera ce plein.
3. Sur « Enregistrer », l'écran appelle `app.checkFillup(saisie)`, qui délègue à
   `validateFillup()` : formats, bornes, date non future, compteur entre le plein précédent et
   le suivant. Les erreurs s'affichent sous les champs ; les valeurs inhabituelles (plus que le
   réservoir, consommation hors de 2–30 L/100 km) demandent une confirmation.
4. `app.saveFillup(valeur)` ajoute l'identifiant et les dates via `repositories.js`, puis `db.js`
   écrit dans une transaction IndexedDB.
5. `app.load()` relit les données et recalcule l'analyse (`analyzeFillups`).
6. L'écran navigue vers `#/historique`, reconstruit à partir du nouvel état ; un message confirme.

## 5. Calcul de la consommation (méthode de plein à plein)

Après un plein complet, le réservoir est plein. Au plein complet suivant, la quantité versée —
plus celle des pleins partiels intermédiaires — correspond exactement au carburant brûlé :

```
consommation (L/100 km) = litres versés depuis le plein complet précédent ÷ km parcourus × 100
```

| Plein | Compteur | Litres | Complet | Calcul |
| --- | --- | --- | --- | --- |
| 1 | 10 000 | 40 | oui | point de départ |
| 2 | 10 300 | 10 | non | litres reportés |
| 3 | 10 600 | 26 | oui | (10 + 26) ÷ 600 × 100 = **6,0 L/100 km** |

Les moyennes (accueil, statistiques) additionnent litres et kilomètres des segments avant de
diviser, ce qui pondère correctement les longs trajets. Le coût au kilomètre suit le même principe.

## 6. Hors ligne et mises à jour

`sw.js` copie tous les fichiers de l'appli dans un cache nommé d'après sa version, puis sert
chaque requête depuis ce cache : l'appli s'ouvre instantanément, même sans réseau. Pour publier
une nouvelle version, on modifie les fichiers **puis** on incrémente `VERSION` dans `sw.js`
(et `APP_VERSION` dans `constants.js`). Le navigateur télécharge la nouvelle version en
arrière-plan et l'appli propose « Mettre à jour » ; l'ancien cache est supprimé ensuite.
Un test vérifie que chaque fichier publié figure bien dans la liste du cache.

## 7. Sauvegardes

- **JSON** : `{ format, version, exportedAt, data: { vehicles, fillups, reminders, settings } }`.
- **Chiffrée** : le même JSON chiffré en AES-256-GCM avec une clé dérivée du mot de passe
  (PBKDF2-SHA-256, 600 000 itérations, sel aléatoire) ; le fichier contient sel, vecteur
  d'initialisation et données en base64, jamais le mot de passe.
- **Import** : taille ≤ 5 Mo, clés `__proto__`/`constructor` ignorées, format et version vérifiés,
  chaque enregistrement revalidé, liens plein → véhicule contrôlés. Au moindre problème, rien
  n'est importé ; sinon tout est remplacé dans une seule transaction.
- **CSV** : séparateur « ; », virgule décimale, BOM UTF-8 pour Excel, cellules commençant par
  `= + - @` neutralisées.

## 8. Tests

| Commande | Contenu |
| --- | --- |
| `npm test` | 40 tests : nombres et dates, consommation, statistiques, validation, rappels, démo, routeur, liste du cache, absence d'`innerHTML`/`eval`, stockage IndexedDB, sauvegardes simples et chiffrées, imports piégés, CSV |
| `npm run test:e2e` | parcours complet dans Chrome : saisie, erreurs, démo, sauvegarde chiffrée, restauration, CSV, tentative XSS, mode hors ligne, en-têtes de sécurité ; échoue à la moindre erreur console ou violation CSP |

## 9. Faire évoluer le code

- **Ajouter un champ à un plein** : le valider dans `validation.js`, l'afficher dans
  `fillup-form.js` et `history.js`, l'ajouter à l'export CSV. Pas de migration nécessaire
  (IndexedDB stocke des objets) tant qu'aucun index n'est requis.
- **Ajouter un index ou un magasin** : nouvelle migration `MIGRATIONS[2]` et `DB_VERSION = 2`
  dans `db.js`.
- **Ajouter un écran** : un fichier dans `screens/`, une ligne dans `routes.js`, le fichier
  dans la liste `ASSETS` de `sw.js` (le test le rappelle).
- **Synchroniser entre appareils** : fournir d'autres dépôts avec les mêmes fonctions
  (`list`, `save`, `remove`…) qui parlent à un service en ligne, avec authentification et règles
  d'accès par utilisateur. Le domaine et les écrans ne changent pas.
