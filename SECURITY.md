# Sécurité — Suivi Carburant

## Principe

La meilleure façon de protéger des données est de ne pas les envoyer : Suivi Carburant n'a
**ni serveur, ni compte, ni base de données en ligne, ni service tiers**. Les données restent dans
le navigateur de l'appareil, isolées par le navigateur pour ce seul site. Le site publié est un
ensemble de fichiers statiques servis en HTTPS : il n'y a pas de code serveur à attaquer.

## Mesures en place

| Risque | Protection |
| --- | --- |
| Injection de code (XSS) via une saisie ou un fichier importé | Tout le texte est inséré avec des nœuds texte (`dom.js`), jamais `innerHTML` ; un test refuse `innerHTML`, `eval`, `new Function` et les gestionnaires en ligne dans le code publié |
| Script injecté malgré tout | Politique CSP stricte : uniquement les fichiers du site (`script-src 'self'`), aucun script ni style en ligne, `object-src 'none'`, `base-uri 'none'` |
| Manipulation du DOM par un script tiers | Trusted Types obligatoires (`require-trusted-types-for 'script'`), une seule politique autorisée pour l'adresse du service worker |
| Affichage dans un cadre d'un autre site (clickjacking) | `frame-ancestors 'none'` et `X-Frame-Options: DENY` (Netlify, Cloudflare) + refus de démarrer dans un cadre (toutes plateformes) |
| Fuite vers des tiers | Aucune ressource externe : polices auto-hébergées, pas d'analytique, `connect-src 'self'`, `Referrer-Policy: no-referrer` |
| Accès aux capteurs | `Permissions-Policy` : caméra, micro, géolocalisation, paiement, USB désactivés |
| Fichier de sauvegarde piégé | Taille ≤ 5 Mo, clés `__proto__`/`constructor` ignorées, format et version vérifiés, chaque enregistrement revalidé et reconstruit, identifiants filtrés, import tout-ou-rien |
| Saisies absurdes ou corrompues | Validation métier de chaque champ (bornes, dates, compteur croissant), caractères invisibles et de direction du texte supprimés |
| Injection de formules dans Excel | Cellules CSV commençant par `= + - @` préfixées d'une apostrophe |
| Vol d'une sauvegarde | Sauvegarde chiffrée : AES-256-GCM, clé dérivée par PBKDF2-SHA-256 (600 000 itérations), fichier modifié détecté |
| Adresses forgées | Routeur : paramètres limités à lettres, chiffres et tirets |
| Interception réseau | HTTPS fourni par l'hébergeur, `Strict-Transport-Security`, `upgrade-insecure-requests` |
| Dépendance compromise | Aucune bibliothèque à l'exécution ; une seule dépendance de développement (tests) |
| Perte de données | Rappel de sauvegarde après 30 jours, demande de stockage persistant au premier plein, transactions IndexedDB |

## Limites connues

- Les données ne sont **pas chiffrées sur l'appareil** : quelqu'un qui a accès au téléphone
  déverrouillé et à son navigateur peut les lire. Le verrouillage de l'appareil reste la protection.
- Effacer les données du navigateur, ou désinstaller l'appli, efface les pleins : il faut des
  sauvegardes régulières (rappel intégré).
- Sur GitHub Pages, les en-têtes HTTP ne sont pas configurables : la CSP passe par la balise
  `<meta>`, et la protection contre l'affichage en cadre par le code de démarrage.
- Un mot de passe de sauvegarde oublié ne peut pas être récupéré.

## Signaler un problème

Ouvrez une « issue » privée (onglet Security du dépôt) ou contactez le propriétaire du dépôt.
Merci de ne pas publier le détail d'une faille avant sa correction.
