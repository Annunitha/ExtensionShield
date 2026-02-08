/**
 * Extension ID Normalization Utility
 * 
 * Chrome extension IDs are 32 characters using base32 encoding (a-p).
 * This utility extracts and normalizes extension IDs from various inputs,
 * handling edge cases like trailing characters, URL fragments, etc.
 */

/**
 * Normalizes an extension ID by extracting a valid 32-character base32 string (a-p).
 * Chrome extension IDs use base32 encoding which only uses letters a-p (lowercase).
 * 
 * @param {string} input - Raw input that may contain an extension ID
 * @returns {string} - Normalized 32-character extension ID, or empty string if not found
 * 
 * @example
 * normalizeExtensionId("jcmljanephecacpljcpiogonhhadfpda") // "jcmljanephecacpljcpiogonhhadfpda"
 * normalizeExtensionId("jcmljanephecacpljcpiogonhhadfpda)") // "jcmljanephecacpljcpiogonhhadfpda" (strips trailing char)
 * normalizeExtensionId("/scan/progress/jcmljanephecacpljcpiogonhhadfpda") // "jcmljanephecacpljcpiogonhhadfpda"
 * normalizeExtensionId("invalid") // ""
 */
export function normalizeExtensionId(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Chrome extension IDs are exactly 32 characters using base32 (a-p only)
  // Match exactly 32 consecutive lowercase letters a-p
  const match = input.match(/[a-p]{32}/);
  return match ? match[0] : '';
}

/**
 * Validates if a string is a valid extension ID format
 * @param {string} id - Extension ID to validate
 * @returns {boolean} - True if valid format
 */
export function isValidExtensionId(id) {
  return typeof id === 'string' && /^[a-p]{32}$/.test(id);
}

