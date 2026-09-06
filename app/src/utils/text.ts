/**
 * Turkish-aware case folding and the [D10] search/mute normaliser.
 *
 * Hermes does not ship full ICU, so `toLocaleUpperCase('tr')` cannot be
 * trusted on device: it silently falls back to the root locale and turns "i"
 * into "I" instead of the dotted capital. Every dotted/dotless pair is
 * therefore mapped explicitly BEFORE the generic case call.
 *
 * U+0130 = dotted capital I, U+0131 = dotless lowercase i.
 */

export type Locale = 'en' | 'tr';

const DOTTED_CAPITAL_I = 'İ'; // I with dot above
const DOTLESS_SMALL_I = 'ı'; // dotless i

/**
 * Uppercase. In Turkish: i -> U+0130 and U+0131 -> I (the generic mapping
 * would give i -> I, which is a different letter in Turkish).
 */
export function upper(s: string, locale: Locale = 'en'): string {
  if (locale === 'tr') {
    return s
      .replace(/i/g, DOTTED_CAPITAL_I)
      .replace(new RegExp(DOTLESS_SMALL_I, 'g'), 'I')
      .toUpperCase();
  }
  return s.toUpperCase();
}

/**
 * Lowercase. In Turkish: I -> U+0131 and U+0130 -> i. The U+0130 mapping must
 * happen first: `'İ'.toLowerCase()` in JS yields "i" + U+0307 COMBINING
 * DOT ABOVE, which compares unequal to a plain "i".
 */
export function lower(s: string, locale: Locale = 'en'): string {
  if (locale === 'tr') {
    return s
      .replace(new RegExp(DOTTED_CAPITAL_I, 'g'), 'i')
      .replace(/I/g, DOTLESS_SMALL_I)
      .toLowerCase();
  }
  return s.toLowerCase();
}

/**
 * [D10] The one normaliser used for muted words, section search and people
 * search — client and server must agree, so keep this in step with the
 * server-side implementation.
 *
 * Turkish-aware lowercase, then dotless i -> i, then NFD + strip combining
 * marks, so "Bogazici" with and without its diacritics folds to one key.
 */
export function normalizeForSearch(s: string): string {
  return lower(s, 'tr')
    .replace(new RegExp(DOTLESS_SMALL_I, 'g'), 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
