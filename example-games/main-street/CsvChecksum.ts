/**
 * CSV Checksum Utility
 *
 * Provides a deterministic hash function for computing checksums of CSV text.
 * This is used to detect when the card-data.csv has changed, so that SVG
 * card assets can be regenerated to match.
 *
 * The checksum is suitable for change detection, NOT cryptographic security.
 *
 * @module
 */

/**
 * Compute a deterministic checksum (DJB2 hash, hex-encoded) from CSV text.
 *
 * The same CSV content always produces the same checksum. Any change to the
 * CSV content (even whitespace) produces a different checksum.
 *
 * @param csvText - The raw CSV text (header + data rows).
 * @returns An 8-character hex string.
 *
 * @example
 * ```ts
 * computeCsvChecksum('family,id,name\nbusiness,biz-a,Alpha\n');
 * // => 'a1b2c3d4'
 * ```
 */
export function computeCsvChecksum(csvText: string): string {
  let hash = 5381;
  for (let i = 0; i < csvText.length; i++) {
    hash = ((hash << 5) + hash + csvText.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
