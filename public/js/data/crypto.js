/**
 * Chiffrement des sauvegardes avec un mot de passe (Web Crypto API, intégrée au navigateur).
 *
 * - Dérivation de clé : PBKDF2-SHA-256, 600 000 itérations (recommandation OWASP), sel aléatoire de 16 octets.
 * - Chiffrement : AES-256-GCM, vecteur d'initialisation aléatoire de 12 octets.
 *   GCM est « authentifié » : un fichier modifié ou un mauvais mot de passe est détecté au déchiffrement.
 * Le mot de passe n'est jamais stocké : s'il est perdu, la sauvegarde est illisible.
 */

export const ENCRYPTED_FORMAT = 'suivi-carburant/sauvegarde-chiffree';
export const KDF_ITERATIONS = 600_000;
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 5_000_000; // borne haute : un fichier piégé ne doit pas bloquer l'appareil

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class CryptoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CryptoError';
  }
}

export function cryptoAvailable() {
  return Boolean(globalThis.crypto?.subtle);
}

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function isEncryptedEnvelope(value) {
  return value !== null && typeof value === 'object' && value.format === ENCRYPTED_FORMAT;
}

/** Chiffre un texte et renvoie une « enveloppe » JSON autodescriptive. */
export async function encryptText(plaintext, passphrase, { iterations = KDF_ITERATIONS } = {}) {
  if (!cryptoAvailable()) throw new CryptoError('Le chiffrement nécessite une connexion sécurisée (HTTPS).');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext)));
  return {
    format: ENCRYPTED_FORMAT,
    version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(ciphertext),
  };
}

/** Déchiffre une enveloppe. Les paramètres sont vérifiés avant tout calcul. */
export async function decryptText(envelope, passphrase) {
  if (!cryptoAvailable()) throw new CryptoError('Le déchiffrement nécessite une connexion sécurisée (HTTPS).');
  const { kdf, cipher, data } = envelope ?? {};
  const valid = envelope?.version === 1
    && kdf?.name === 'PBKDF2' && kdf.hash === 'SHA-256'
    && Number.isInteger(kdf.iterations) && kdf.iterations >= MIN_ITERATIONS && kdf.iterations <= MAX_ITERATIONS
    && typeof kdf.salt === 'string' && cipher?.name === 'AES-GCM' && typeof cipher.iv === 'string'
    && typeof data === 'string';
  if (!valid) throw new CryptoError('Fichier chiffré invalide ou version non prise en charge.');

  let salt;
  let iv;
  let bytes;
  try {
    salt = fromBase64(kdf.salt);
    iv = fromBase64(cipher.iv);
    bytes = fromBase64(data);
  } catch {
    throw new CryptoError('Fichier chiffré endommagé.');
  }
  if (salt.length !== 16 || iv.length !== 12 || bytes.length < 17) throw new CryptoError('Fichier chiffré endommagé.');

  const key = await deriveKey(passphrase, salt, kdf.iterations);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes);
    return decoder.decode(plaintext);
  } catch {
    throw new CryptoError('Mot de passe incorrect, ou fichier modifié depuis la sauvegarde.');
  }
}
