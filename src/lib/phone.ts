/**
 * Normalisation des numéros de téléphone Béninois.
 * Format national : 8 ou 10 chiffres
 * Format international : +229 XX XX XX XX
 */

export function normalizeBeninDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Retourne le numéro en format E.164 (sans espaces) pour wa.me
 * Ex: "+229 01 57 77 63 21" -> "2290157776321"
 */
export function toE164(raw: string): string {
  const digits = normalizeBeninDigits(raw);

  if (digits.startsWith('229') && digits.length === 12) {
    return digits;
  }

  if (digits.startsWith('+229')) {
    return digits.substring(1);
  }

  if (digits.length === 10) {
    return '229' + digits;
  }

  if (digits.length === 8) {
    return '229' + digits;
  }

  return digits;
}

/**
 * Retourne le numéro formaté pour affichage : ex: +229 01 57 77 63 21
 */
export function formatForDisplay(raw: string): string {
  const digits = normalizeBeninDigits(raw);

  if (digits.startsWith('229') && digits.length === 12) {
    const rest = digits.slice(3);
    return '+229 ' + rest.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4');
  }

  if (digits.startsWith('+229')) {
    const rest = digits.slice(3);
    return '+229 ' + rest.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4');
  }

  if (digits.length === 10) {
    return '+229 ' + digits.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4');
  }

  if (digits.length === 8) {
    return '+229 ' + digits.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4');
  }

  return raw;
}

/**
 * Vérifie si le numéro semble valide pour le Bénin
 */
export function isValidBeninNumber(raw: string): boolean {
  const digits = normalizeBeninDigits(raw);
  if (digits.startsWith('229') && digits.length === 12) return true;
  if (digits.startsWith('+229') && digits.length === 13) return true;
  if (digits.length === 10) return true;
  if (digits.length === 8) return true;
  return false;
}
