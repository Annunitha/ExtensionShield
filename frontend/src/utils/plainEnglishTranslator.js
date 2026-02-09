/**
 * plainEnglishTranslator - Translates technical reasons into consumer-friendly bullets
 * 
 * Deterministic mapping - no AI/LLM. Uses pattern matching on technical terms.
 */

/**
 * Translate a technical reason string into plain English
 * @param {string} reason - Technical reason from scoring
 * @returns {string} - Plain English translation
 */
export function translateReason(reason) {
  if (!reason || typeof reason !== 'string') return reason;

  const lower = reason.toLowerCase();

  // Permission-based translations
  if (lower.includes('cookies') && (lower.includes('webrequest') || lower.includes('web_request'))) {
    return 'Can read and modify your web traffic (cookies/requests).';
  }
  if (lower.includes('<all_urls>') || lower.includes('all_urls') || lower.includes('all websites')) {
    return 'Can access content on most websites you visit.';
  }
  if (lower.includes('broad host') || lower.includes('broad_host')) {
    return 'Can access content on many websites.';
  }
  if (lower.includes('clipboardread') || lower.includes('clipboard_read')) {
    return 'Can read your clipboard (copied text).';
  }
  if (lower.includes('history')) {
    return 'Can access your browsing history.';
  }
  if (lower.includes('debugger')) {
    return 'Can debug and inspect browser behavior.';
  }
  if (lower.includes('nativemessaging') || lower.includes('native_messaging')) {
    return 'Can communicate with programs outside the browser.';
  }
  if (lower.includes('proxy')) {
    return 'Can intercept and modify network traffic.';
  }
  if (lower.includes('desktopcapture') || lower.includes('desktop_capture') || lower.includes('tabcapture') || lower.includes('tab_capture')) {
    return 'Can capture screenshots or screen content.';
  }

  // SAST/Code-based translations
  if (lower.includes('sast') || lower.includes('static analysis')) {
    if (lower.includes('critical') || lower.includes('high')) {
      return 'Code contains a high-risk pattern often used for malware.';
    }
    return 'Code analysis detected potential security issues.';
  }
  if (lower.includes('sql injection') || lower.includes('sqlinjection')) {
    return 'Code contains SQL injection vulnerability.';
  }
  if (lower.includes('xss') || lower.includes('cross-site scripting')) {
    return 'Code contains cross-site scripting vulnerability.';
  }
  if (lower.includes('rce') || lower.includes('remote code execution')) {
    return 'Code may allow remote code execution.';
  }

  // VirusTotal translations
  if (lower.includes('virustotal') || lower.includes('virus total') || lower.includes('malware')) {
    if (lower.includes('detected') || lower.includes('flagged')) {
      return 'Detected as potentially malicious by security scanners.';
    }
    return 'Security scanners flagged this extension.';
  }

  // Network/Exfiltration translations
  if (lower.includes('exfil') || lower.includes('exfiltration') || lower.includes('sensitive exfil')) {
    return 'May send sensitive data to external servers.';
  }
  if (lower.includes('network') && (lower.includes('external') || lower.includes('third-party') || lower.includes('third_party'))) {
    return 'Connects to external servers (may send data).';
  }
  if (lower.includes('analytics') || lower.includes('tracking')) {
    return 'May track your browsing activity.';
  }

  // Privacy/Compliance translations
  if (lower.includes('privacy policy') && (lower.includes('missing') || lower.includes('no'))) {
    return 'No privacy policy found (data practices not disclosed).';
  }
  if (lower.includes('tos violation') || lower.includes('tos_violation')) {
    return 'Violates terms of service or policy restrictions.';
  }
  if (lower.includes('purpose mismatch') || lower.includes('purpose_mismatch')) {
    return 'Claims one purpose but behaves differently.';
  }
  if (lower.includes('disclosure') && (lower.includes('missing') || lower.includes('no'))) {
    return 'Data collection practices not clearly disclosed.';
  }

  // Obfuscation translations
  if (lower.includes('obfuscat') || lower.includes('entropy')) {
    return 'Code is heavily obfuscated (may hide malicious behavior).';
  }

  // Score-based translations
  if (lower.includes('score') && (lower.includes('low') || lower.includes('below'))) {
    if (lower.includes('security')) {
      return 'Security score is below acceptable threshold.';
    }
    if (lower.includes('privacy')) {
      return 'Privacy score indicates significant data risks.';
    }
    return 'Overall safety score is below acceptable threshold.';
  }

  // Gate-based translations
  if (lower.includes('block') || lower.includes('blocked')) {
    return 'Automated security checks blocked this extension.';
  }
  if (lower.includes('warn') || lower.includes('needs review')) {
    return 'Requires manual review before use.';
  }

  // Fallback: return original if no pattern matches
  return reason;
}

/**
 * Get top reasons in plain English (2-3 bullets max)
 * @param {string[]} reasons - Array of technical reasons
 * @returns {string[]} - Top 2-3 plain English bullets
 */
export function getTopPlainEnglishReasons(reasons = []) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return [];
  }

  // Translate all reasons
  const translated = reasons.map(translateReason);

  // Remove duplicates (case-insensitive)
  const unique = [];
  const seen = new Set();
  for (const reason of translated) {
    const lower = reason.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      unique.push(reason);
    }
  }

  // Return top 2-3
  return unique.slice(0, 3);
}

/**
 * Get "At a glance" summary bullets from scores and reasons
 * @param {Object} scores - Scores object with decision and reasons
 * @param {Object} factorsByLayer - Factors by layer
 * @returns {string[]} - 2-3 plain English bullets
 */
export function getAtAGlanceBullets(scores = {}, factorsByLayer = {}) {
  const bullets = [];

  // Priority 1: Decision-based
  if (scores?.decision === 'BLOCK') {
    bullets.push('Automated security checks blocked this extension.');
  } else if (scores?.decision === 'WARN') {
    bullets.push('Requires manual review before use.');
  }

  // Priority 2: Top reasons (translated)
  if (scores?.reasons && scores.reasons.length > 0) {
    const topReasons = getTopPlainEnglishReasons(scores.reasons);
    bullets.push(...topReasons);
  }

  // Priority 3: High-severity factors
  if (bullets.length < 3) {
    const allFactors = [
      ...(factorsByLayer?.security || []),
      ...(factorsByLayer?.privacy || []),
      ...(factorsByLayer?.governance || []),
    ];
    const highSeverity = allFactors
      .filter(f => (f.severity || 0) >= 0.7)
      .sort((a, b) => (b.riskContribution || 0) - (a.riskContribution || 0))
      .slice(0, 3 - bullets.length);

    for (const factor of highSeverity) {
      const translated = translateReason(factor.name);
      if (translated && !bullets.includes(translated)) {
        bullets.push(translated);
      }
    }
  }

  // Return top 2-3
  return bullets.slice(0, 3);
}

