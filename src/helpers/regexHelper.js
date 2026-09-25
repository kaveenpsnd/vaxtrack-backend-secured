/**
 * Escapes special regex characters in user input to prevent ReDoS (Regular Expression Denial of Service)
 * and unintended pattern matching in MongoDB $regex queries.
 *
 * @param {string} str - User-supplied string
 * @returns {string} Escaped string safe for regex constructors and MongoDB $regex
 */
export const escapeRegex = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
