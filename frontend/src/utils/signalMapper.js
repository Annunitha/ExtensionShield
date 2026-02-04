/**
 * Signal Mapper Utility
 * 
 * Maps scan results to ExtensionShield's three-engine signal system:
 * - Code: SAST findings, entropy/obfuscation analysis
 * - Permissions: Permission risk assessment
 * - Intel: VirusTotal and threat intelligence
 */

// Signal levels
export const SIGNAL_LEVELS = {
  OK: 'ok',
  WARN: 'warn',
  HIGH: 'high'
};

// Risk level thresholds
const THRESHOLDS = {
  PERMISSIONS: {
    HIGH_COUNT_WARN: 2,
    HIGH_COUNT_HIGH: 4
  },
  SAST: {
    CRITICAL_HIGH: 1,
    HIGH_WARN: 2,
    MEDIUM_WARN: 5
  },
  ENTROPY: {
    OBFUSCATED_WARN: 1,
    OBFUSCATED_HIGH: 3
  },
  VIRUSTOTAL: {
    MALICIOUS_WARN: 1,
    MALICIOUS_HIGH: 3
  }
};

/**
 * Calculate code signal from SAST and entropy analysis
 */
export function calculateCodeSignal(scanResult) {
  const sastResults = scanResult?.sast_results || scanResult?.sastResults || {};
  const entropyAnalysis = scanResult?.entropy_analysis || scanResult?.entropyAnalysis || {};
  
  // Count SAST findings by severity
  const findings = sastResults?.sast_findings || sastResults?.findings || {};
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  
  Object.values(findings).forEach(fileFindings => {
    if (Array.isArray(fileFindings)) {
      fileFindings.forEach(finding => {
        const severity = (finding.extra?.severity || finding.severity || '').toUpperCase();
        if (severity === 'CRITICAL') criticalCount++;
        else if (severity === 'HIGH' || severity === 'ERROR') highCount++;
        else if (severity === 'MEDIUM' || severity === 'WARNING') mediumCount++;
      });
    }
  });
  
  // Check obfuscation
  const obfuscatedFiles = entropyAnalysis?.obfuscated_files || entropyAnalysis?.obfuscatedFiles || 0;
  
  // Determine signal level
  let level = SIGNAL_LEVELS.OK;
  let label = 'Clean';
  
  if (criticalCount >= THRESHOLDS.SAST.CRITICAL_HIGH) {
    level = SIGNAL_LEVELS.HIGH;
    label = `${criticalCount} critical`;
  } else if (highCount >= THRESHOLDS.SAST.HIGH_WARN || obfuscatedFiles >= THRESHOLDS.ENTROPY.OBFUSCATED_HIGH) {
    level = SIGNAL_LEVELS.HIGH;
    const issues = [];
    if (highCount > 0) issues.push(`${highCount} high`);
    if (obfuscatedFiles > 0) issues.push(`${obfuscatedFiles} obfusc`);
    label = issues.join(', ');
  } else if (mediumCount >= THRESHOLDS.SAST.MEDIUM_WARN || obfuscatedFiles >= THRESHOLDS.ENTROPY.OBFUSCATED_WARN) {
    level = SIGNAL_LEVELS.WARN;
    const issues = [];
    if (mediumCount > 0) issues.push(`${mediumCount} med`);
    if (obfuscatedFiles > 0) issues.push(`${obfuscatedFiles} obfusc`);
    label = issues.join(', ');
  } else if (criticalCount > 0 || highCount > 0 || mediumCount > 0) {
    level = SIGNAL_LEVELS.WARN;
    const total = criticalCount + highCount + mediumCount;
    label = `${total} issue${total !== 1 ? 's' : ''}`;
  }
  
  return { level, label };
}

/**
 * Calculate permissions signal from permissions analysis
 */
export function calculatePermsSignal(scanResult) {
  const permsAnalysis = scanResult?.permissions_analysis || scanResult?.permissionsAnalysis || {};
  const permissions = permsAnalysis?.permissions_details || permsAnalysis?.permissions || [];
  
  // Count high-risk permissions
  let highRiskCount = 0;
  let mediumRiskCount = 0;
  
  const permissionsList = Array.isArray(permissions) ? permissions : Object.values(permissions);
  
  permissionsList.forEach(perm => {
    const risk = (perm.risk || perm.risk_level || '').toLowerCase();
    if (risk === 'high' || risk === 'critical') highRiskCount++;
    else if (risk === 'medium') mediumRiskCount++;
  });
  
  // Also check manifest for dangerous permissions
  const manifest = scanResult?.manifest || {};
  const dangerousPerms = ['<all_urls>', 'webRequest', 'webRequestBlocking', 'clipboardRead', 
                          'history', 'management', 'nativeMessaging', 'debugger'];
  
  const allPerms = [
    ...(manifest.permissions || []),
    ...(manifest.host_permissions || [])
  ];
  
  allPerms.forEach(p => {
    if (dangerousPerms.some(dp => p.includes(dp))) {
      highRiskCount++;
    }
  });
  
  // Determine signal level
  let level = SIGNAL_LEVELS.OK;
  let label = 'Minimal';
  
  if (highRiskCount >= THRESHOLDS.PERMISSIONS.HIGH_COUNT_HIGH) {
    level = SIGNAL_LEVELS.HIGH;
    label = `${highRiskCount} high-risk`;
  } else if (highRiskCount >= THRESHOLDS.PERMISSIONS.HIGH_COUNT_WARN) {
    level = SIGNAL_LEVELS.WARN;
    label = `${highRiskCount} high`;
  } else if (mediumRiskCount > 2) {
    level = SIGNAL_LEVELS.WARN;
    label = `${mediumRiskCount} medium`;
  } else if (highRiskCount > 0) {
    level = SIGNAL_LEVELS.WARN;
    label = `${highRiskCount} sensitive`;
  }
  
  return { level, label };
}

/**
 * Calculate intel signal from VirusTotal and threat intelligence
 */
export function calculateIntelSignal(scanResult) {
  const vtAnalysis = scanResult?.virustotal_analysis || scanResult?.virustotalAnalysis || {};
  
  const maliciousCount = vtAnalysis?.total_malicious || vtAnalysis?.malicious || 0;
  const suspiciousCount = vtAnalysis?.total_suspicious || vtAnalysis?.suspicious || 0;
  
  // Determine signal level
  let level = SIGNAL_LEVELS.OK;
  let label = '0 flags';
  
  if (maliciousCount >= THRESHOLDS.VIRUSTOTAL.MALICIOUS_HIGH) {
    level = SIGNAL_LEVELS.HIGH;
    label = `${maliciousCount} malicious`;
  } else if (maliciousCount >= THRESHOLDS.VIRUSTOTAL.MALICIOUS_WARN) {
    level = SIGNAL_LEVELS.HIGH;
    label = `${maliciousCount} flagged`;
  } else if (suspiciousCount > 2) {
    level = SIGNAL_LEVELS.WARN;
    label = `${suspiciousCount} suspicious`;
  } else if (maliciousCount > 0 || suspiciousCount > 0) {
    level = SIGNAL_LEVELS.WARN;
    const total = maliciousCount + suspiciousCount;
    label = `${total} flag${total !== 1 ? 's' : ''}`;
  }
  
  return { level, label };
}

/**
 * Calculate all signals for a scan result
 */
export function calculateAllSignals(scanResult) {
  return {
    code_signal: calculateCodeSignal(scanResult),
    perms_signal: calculatePermsSignal(scanResult),
    intel_signal: calculateIntelSignal(scanResult)
  };
}

/**
 * Determine risk level from score
 */
export function getRiskLevel(score) {
  if (score >= 80) return 'LOW';
  if (score >= 60) return 'MED';
  if (score >= 40) return 'MODERATE';
  return 'HIGH';
}

/**
 * Get risk color class based on level
 */
export function getRiskColorClass(level) {
  switch (level?.toUpperCase()) {
    case 'LOW':
      return 'risk-low';
    case 'MED':
    case 'MEDIUM':
    case 'MODERATE':
      return 'risk-medium';
    case 'HIGH':
    case 'CRITICAL':
      return 'risk-high';
    default:
      return 'risk-unknown';
  }
}

/**
 * Get signal color class based on level
 */
export function getSignalColorClass(level) {
  switch (level) {
    case SIGNAL_LEVELS.OK:
      return 'signal-ok';
    case SIGNAL_LEVELS.WARN:
      return 'signal-warn';
    case SIGNAL_LEVELS.HIGH:
      return 'signal-high';
    default:
      return 'signal-unknown';
  }
}

/**
 * Count total findings from scan result
 */
export function countFindings(scanResult) {
  const riskDist = scanResult?.risk_distribution || scanResult?.riskDistribution || {};
  return (riskDist.high || 0) + (riskDist.medium || 0) + (riskDist.low || 0);
}

/**
 * Get top finding summary (single line)
 */
export function getTopFindingSummary(scanResult) {
  const sastResults = scanResult?.sast_results || scanResult?.sastResults || {};
  const findings = sastResults?.sast_findings || sastResults?.findings || {};
  
  // Find the highest severity finding
  let topFinding = null;
  const severityOrder = ['CRITICAL', 'HIGH', 'ERROR', 'MEDIUM', 'WARNING', 'LOW', 'INFO'];
  
  for (const severity of severityOrder) {
    for (const fileFindings of Object.values(findings)) {
      if (Array.isArray(fileFindings)) {
        const match = fileFindings.find(f => 
          (f.extra?.severity || f.severity || '').toUpperCase() === severity
        );
        if (match) {
          topFinding = match;
          break;
        }
      }
    }
    if (topFinding) break;
  }
  
  if (topFinding) {
    const message = topFinding.extra?.message || topFinding.message || topFinding.check_id || 'Security issue detected';
    // Truncate to ~60 chars
    return message.length > 60 ? message.substring(0, 57) + '...' : message;
  }
  
  return null;
}

/**
 * Enrich scan data with signals and risk info
 */
export function enrichScanWithSignals(scan, fullResult) {
  const score = fullResult?.overall_security_score || fullResult?.security_score || scan?.security_score || 0;
  const riskLevel = fullResult?.overall_risk || fullResult?.risk_level || getRiskLevel(score);
  const findingsCount = fullResult?.total_findings || countFindings(fullResult) || 0;
  
  return {
    ...scan,
    score,
    risk_level: riskLevel,
    findings_count: findingsCount,
    top_finding_summary: getTopFindingSummary(fullResult),
    signals: calculateAllSignals(fullResult),
    last_scanned_at: scan.timestamp || fullResult?.timestamp
  };
}

export default {
  calculateCodeSignal,
  calculatePermsSignal,
  calculateIntelSignal,
  calculateAllSignals,
  getRiskLevel,
  getRiskColorClass,
  getSignalColorClass,
  countFindings,
  getTopFindingSummary,
  enrichScanWithSignals,
  SIGNAL_LEVELS
};

