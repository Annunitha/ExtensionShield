/**
 * Risk color utilities. Use for SVG/canvas/interpolation where hex is required.
 * CSS variables (var(--risk-good) etc.) are preferred in styles; use getRiskHex when you need computed hex.
 */

const RISK_VARS = { good: '--risk-good', warn: '--risk-warn', bad: '--risk-bad', neutral: '--risk-neutral' };

function parseCssColorToHex(value) {
  if (!value) return '#6B7280';
  const s = value.trim();
  if (s.startsWith('#')) return s.length === 7 ? s : s.slice(0, 7);
  const rgb = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    const r = Math.max(0, Math.min(255, parseInt(rgb[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(rgb[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(rgb[3], 10)));
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  return '#6B7280';
}

/**
 * Return risk color as hex (for interpolation, canvas, or when var() cannot be used).
 * Call after mount so document is available.
 */
export function getRiskHex(band) {
  if (typeof document === 'undefined') return '#6B7280';
  const key = band === 'GOOD' ? 'good' : band === 'WARN' ? 'warn' : band === 'BAD' ? 'bad' : 'neutral';
  const varName = RISK_VARS[key];
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return parseCssColorToHex(value);
}

/**
 * Return info (blue) color as hex for canvas/SVG where CSS var cannot be used.
 * Resolves hsl(var(--color-info)) via a temporary element.
 */
export function getInfoHex() {
  if (typeof document === 'undefined') return '#3b82f6';
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:-9999px;color:hsl(var(--color-info));';
  document.body.appendChild(el);
  const value = getComputedStyle(el).color;
  document.body.removeChild(el);
  return parseCssColorToHex(value);
}
