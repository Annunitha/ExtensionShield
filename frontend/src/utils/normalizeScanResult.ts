/**
 * normalizeScanResult - Data Mapping Layer
 * 
 * Transforms RawScanResult API payload into ReportViewModel for UI consumption.
 * 
 * MAPPING RULES:
 * A) Primary source: raw.scoring_v2 (or governance_bundle.scoring_v2)
 *    - Scores from scoring_v2.overall_score/security_score/privacy_score/governance_score
 *    - Confidence from scoring_v2.overall_confidence
 *    - Decision + reasons from scoring_v2.decision / decision_reasons
 *    - Factors from scoring_v2.security_layer/privacy_layer/governance_layer.factors
 * B) Evidence index (source order - NO GUESSING):
 *    1. raw.governance_bundle?.signal_pack?.evidence (SignalPack - List<ToolEvidence>)
 *    2. raw.signal_pack?.evidence (if API returns it directly)
 *    3. raw.governance_bundle?.evidence_index?.evidence (legacy - dict keyed by evidence_id)
 *    -> Returns {} if no evidence exists (never throws)
 * C) Key findings: Hard gates + top factors by contribution + decision_reasons fallback
 * D) Bands: decision-based (ALLOW->GOOD, WARN->WARN, BLOCK->BAD) or score-based
 * E) Never compute scores client-side - only display what backend sent
 */

import type {
  RawScanResult,
  RawScoringV2,
  RawLayerScore,
  RawFactorScore,
  RawEvidenceItem,
  RawToolEvidence,
  RawSignalPack,
  ReportViewModel,
  MetaVM,
  ScoresVM,
  ScoreVM,
  ScoreBand,
  Decision,
  FactorsByLayerVM,
  FactorVM,
  KeyFindingVM,
  FindingSeverity,
  PermissionsVM,
  EvidenceItemVM,
  ConsumerInsights,
} from './reportTypes';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Safely get a value or return a default
 */
function safeGet<T>(value: T | undefined | null, defaultValue: T): T {
  return value !== undefined && value !== null ? value : defaultValue;
}

/**
 * Map decision string to normalized Decision type
 */
function normalizeDecision(decision?: string | null): Decision {
  if (!decision) return null;
  const upper = decision.toUpperCase();
  if (upper === 'ALLOW') return 'ALLOW';
  if (upper === 'BLOCK') return 'BLOCK';
  if (upper === 'WARN' || upper === 'NEEDS_REVIEW') return 'WARN';
  return null;
}

/**
 * Get score band from decision
 */
function bandFromDecision(decision: Decision): ScoreBand {
  switch (decision) {
    case 'ALLOW':
      return 'GOOD';
    case 'WARN':
      return 'WARN';
    case 'BLOCK':
      return 'BAD';
    default:
      return 'NA';
  }
}

/**
 * Get score band from score value
 */
function bandFromScore(score: number | null): ScoreBand {
  if (score === null) return 'NA';
  if (score >= 80) return 'GOOD';
  if (score >= 60) return 'WARN';
  return 'BAD';
}

/**
 * Map severity number [0,1] to finding severity
 */
function severityToFindingLevel(severity: number): FindingSeverity {
  if (severity >= 0.7) return 'high';
  if (severity >= 0.4) return 'medium';
  return 'low';
}

/**
 * Assert that a value exists and return it, or throw
 */
function assertExists<T>(value: T | undefined | null, name: string): T {
  if (value === undefined || value === null) {
    console.warn(`[normalizeScanResult] Missing expected field: ${name}`);
    throw new Error(`Missing required field: ${name}`);
  }
  return value;
}

// =============================================================================
// EXTRACTION HELPERS
// =============================================================================

/**
 * Get scoring_v2 from the best source
 * Priority: raw.scoring_v2 > raw.governance_bundle.scoring_v2
 */
function getScoringV2(raw: RawScanResult): RawScoringV2 | null {
  if (raw.scoring_v2) return raw.scoring_v2;
  if (raw.governance_bundle?.scoring_v2) return raw.governance_bundle.scoring_v2;
  return null;
}

/**
 * Get layer factors from scoring_v2
 */
function getLayerFactors(layer?: RawLayerScore | null): FactorVM[] {
  if (!layer?.factors) return [];
  
  return layer.factors.map((f: RawFactorScore): FactorVM => ({
    name: safeGet(f.name, 'Unknown'),
    severity: safeGet(f.severity, 0),
    confidence: safeGet(f.confidence, 0),
    weight: f.weight,
    riskContribution: f.contribution,
    evidenceIds: safeGet(f.evidence_ids, []),
    details: f.details,
  }));
}

// =============================================================================
// EVIDENCE EXTRACTION - Stable, never throws
// =============================================================================

/**
 * Convert a single evidence item to EvidenceItemVM (safe, never throws)
 */
function toEvidenceItemVM(
  ev: RawToolEvidence | RawEvidenceItem | null | undefined,
  id?: string
): EvidenceItemVM | null {
  if (!ev || typeof ev !== 'object') return null;
  
  try {
    // Handle both ToolEvidence (array format) and EvidenceItem (dict format)
    const toolEvidence = ev as RawToolEvidence;
    const evidenceItem = ev as RawEvidenceItem;
    
    return {
      toolName: toolEvidence.tool_name || evidenceItem.provenance?.split(':')[0] || undefined,
      filePath: ev.file_path ?? undefined,
      lineStart: ev.line_start,
      lineEnd: ev.line_end,
      snippet: ev.snippet ?? undefined,
      timestamp: toolEvidence.timestamp || evidenceItem.created_at,
      rawData: ev,
    };
  } catch {
    console.warn(`[buildEvidenceIndex] Failed to convert evidence item: ${id || 'unknown'}`);
    return null;
  }
}

/**
 * Extract evidence items from raw scan result
 * 
 * SOURCE ORDER (no guessing):
 * 1. raw.governance_bundle?.signal_pack?.evidence (SignalPack - List<ToolEvidence>)
 * 2. raw.signal_pack?.evidence (if API returns it directly at top level)
 * 3. raw.governance_bundle?.evidence_index?.evidence (legacy - dict keyed by evidence_id)
 * 
 * @returns Array of evidence items with their IDs, or empty array if no evidence
 */
export function extractEvidenceItems(
  raw: RawScanResult | null | undefined
): Array<{ id: string; evidence: EvidenceItemVM }> {
  const result: Array<{ id: string; evidence: EvidenceItemVM }> = [];
  
  if (!raw) return result;
  
  try {
    // Source 1: governance_bundle.signal_pack.evidence (LIST - primary source)
    const signalPackEvidence = raw.governance_bundle?.signal_pack?.evidence;
    if (Array.isArray(signalPackEvidence) && signalPackEvidence.length > 0) {
      signalPackEvidence.forEach((ev: RawToolEvidence) => {
        const id = ev.evidence_id;
        if (id) {
          const vm = toEvidenceItemVM(ev, id);
          if (vm) result.push({ id, evidence: vm });
        }
      });
      // If we found evidence in SignalPack, use it as primary source
      if (result.length > 0) return result;
    }
    
    // Source 2: top-level signal_pack.evidence (if API returns it directly)
    const topLevelSignalPack = raw.signal_pack?.evidence;
    if (Array.isArray(topLevelSignalPack) && topLevelSignalPack.length > 0) {
      topLevelSignalPack.forEach((ev: RawToolEvidence) => {
        const id = ev.evidence_id;
        if (id) {
          const vm = toEvidenceItemVM(ev, id);
          if (vm) result.push({ id, evidence: vm });
        }
      });
      // If we found evidence here, return it
      if (result.length > 0) return result;
    }
    
    // Source 3: governance_bundle.evidence_index.evidence (DICT - legacy fallback)
    const evidenceIndexEvidence = raw.governance_bundle?.evidence_index?.evidence;
    if (evidenceIndexEvidence && typeof evidenceIndexEvidence === 'object' && !Array.isArray(evidenceIndexEvidence)) {
      Object.entries(evidenceIndexEvidence).forEach(([id, ev]: [string, RawEvidenceItem]) => {
        const vm = toEvidenceItemVM(ev, id);
        if (vm) result.push({ id, evidence: vm });
      });
    }
  } catch (error) {
    console.warn('[extractEvidenceItems] Error extracting evidence:', error);
    // Return whatever we have so far (empty is fine)
  }
  
  return result;
}

/**
 * Build evidence index from raw scan result
 * 
 * Always returns a stable object (defaults to {})
 * Uses extractEvidenceItems for proper source order
 */
function buildEvidenceIndex(raw: RawScanResult): Record<string, EvidenceItemVM> {
  const evidenceIndex: Record<string, EvidenceItemVM> = {};
  
  try {
    const items = extractEvidenceItems(raw);
    items.forEach(({ id, evidence }) => {
      evidenceIndex[id] = evidence;
    });
  } catch (error) {
    console.warn('[buildEvidenceIndex] Error building evidence index:', error);
    // Return empty object - never throw
  }
  
  return evidenceIndex;
}

/**
 * Build key findings from scoring_v2 data
 */
function buildKeyFindings(
  scoringV2: RawScoringV2 | null,
  raw: RawScanResult
): KeyFindingVM[] {
  const findings: KeyFindingVM[] = [];
  
  // 1. Add hard gates as high severity findings
  const hardGates = scoringV2?.hard_gates_triggered || [];
  hardGates.forEach((gate: string) => {
    findings.push({
      title: gate,
      severity: 'high',
      layer: 'security', // Hard gates are typically security-related
      summary: `Security hard gate triggered: ${gate}`,
      evidenceIds: [],
    });
  });
  
  // 2. Add top 3 factors by riskContribution where severity >= 0.4
  const allFactors: Array<FactorVM & { layer: 'security' | 'privacy' | 'governance' }> = [];
  
  if (scoringV2?.security_layer?.factors) {
    scoringV2.security_layer.factors.forEach((f: RawFactorScore) => {
      if ((f.severity ?? 0) >= 0.4) {
        allFactors.push({
          name: safeGet(f.name, 'Unknown'),
          severity: safeGet(f.severity, 0),
          confidence: safeGet(f.confidence, 0),
          weight: f.weight,
          riskContribution: f.contribution,
          evidenceIds: safeGet(f.evidence_ids, []),
          details: f.details,
          layer: 'security',
        });
      }
    });
  }
  
  if (scoringV2?.privacy_layer?.factors) {
    scoringV2.privacy_layer.factors.forEach((f: RawFactorScore) => {
      if ((f.severity ?? 0) >= 0.4) {
        allFactors.push({
          name: safeGet(f.name, 'Unknown'),
          severity: safeGet(f.severity, 0),
          confidence: safeGet(f.confidence, 0),
          weight: f.weight,
          riskContribution: f.contribution,
          evidenceIds: safeGet(f.evidence_ids, []),
          details: f.details,
          layer: 'privacy',
        });
      }
    });
  }
  
  if (scoringV2?.governance_layer?.factors) {
    scoringV2.governance_layer.factors.forEach((f: RawFactorScore) => {
      if ((f.severity ?? 0) >= 0.4) {
        allFactors.push({
          name: safeGet(f.name, 'Unknown'),
          severity: safeGet(f.severity, 0),
          confidence: safeGet(f.confidence, 0),
          weight: f.weight,
          riskContribution: f.contribution,
          evidenceIds: safeGet(f.evidence_ids, []),
          details: f.details,
          layer: 'governance',
        });
      }
    });
  }
  
  // Sort by contribution (descending) and take top 3
  allFactors
    .sort((a, b) => (b.riskContribution ?? 0) - (a.riskContribution ?? 0))
    .slice(0, 3)
    .forEach((factor) => {
      findings.push({
        title: factor.name,
        severity: severityToFindingLevel(factor.severity),
        layer: factor.layer,
        summary: `${factor.layer.charAt(0).toUpperCase() + factor.layer.slice(1)} factor: severity ${Math.round(factor.severity * 100)}%, confidence ${Math.round(factor.confidence * 100)}%`,
        evidenceIds: factor.evidenceIds,
      });
    });
  
  // 3. If no findings yet, add decision_reasons as low severity
  if (findings.length === 0) {
    const reasons = scoringV2?.decision_reasons || scoringV2?.reasons || [];
    reasons.forEach((reason: string) => {
      findings.push({
        title: reason,
        severity: 'low',
        layer: 'governance',
        summary: reason,
        evidenceIds: [],
      });
    });
  }
  
  // 4. If still no findings, add from legacy summary.key_findings
  if (findings.length === 0 && raw.summary?.key_findings) {
    raw.summary.key_findings.forEach((finding: string) => {
      findings.push({
        title: finding,
        severity: 'medium',
        layer: 'security',
        summary: finding,
        evidenceIds: [],
      });
    });
  }
  
  return findings;
}

/**
 * Build permissions view model
 */
function buildPermissions(raw: RawScanResult): PermissionsVM {
  const manifest = raw.manifest;
  const permsAnalysis = raw.permissions_analysis;
  
  // Support both raw API format (manifest.permissions as string[]) 
  // and formatted data (permissions as array of {name, description, risk})
  const formattedPerms = (raw as unknown as { 
    permissions?: Array<{ name: string; description?: string; risk?: string }> 
  }).permissions;
  
  let apiPermissions: string[] = manifest?.permissions || [];
  let hostPermissions: string[] = manifest?.host_permissions || [];
  
  // If formatted permissions exist, extract permission names
  if (formattedPerms && Array.isArray(formattedPerms) && formattedPerms.length > 0 && typeof formattedPerms[0] === 'object') {
    apiPermissions = formattedPerms.map(p => p.name || String(p));
  }
  
  // Identify high-risk permissions
  const highRiskPerms = [
    '<all_urls>', 'webRequest', 'webRequestBlocking', 'clipboardRead',
    'clipboardWrite', 'history', 'management', 'nativeMessaging', 
    'debugger', 'cookies', 'tabs', 'webNavigation',
  ];
  const highRiskPermissions = apiPermissions.filter((p: string) =>
    highRiskPerms.some((hrp) => p.toLowerCase().includes(hrp.toLowerCase()))
  );
  
  // Find unreasonable permissions from analysis or formatted data
  const unreasonablePermissions: string[] = [];
  if (permsAnalysis?.permissions_details) {
    Object.entries(permsAnalysis.permissions_details).forEach(([name, details]) => {
      if (details && details.is_reasonable === false) {
        unreasonablePermissions.push(name);
      }
    });
  } else if (formattedPerms && Array.isArray(formattedPerms)) {
    // Formatted data has risk field - HIGH risk permissions are unreasonable
    formattedPerms.forEach(p => {
      if (typeof p === 'object' && p.risk === 'HIGH') {
        unreasonablePermissions.push(p.name);
      }
    });
  }
  
  // Identify broad host patterns
  const broadPatterns = ['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*'];
  const broadHostPatterns = hostPermissions.filter((p: string) =>
    broadPatterns.some((bp) => p.includes(bp))
  );
  
  return {
    apiPermissions: apiPermissions.length > 0 ? apiPermissions : undefined,
    hostPermissions: hostPermissions.length > 0 ? hostPermissions : undefined,
    highRiskPermissions: highRiskPermissions.length > 0 ? highRiskPermissions : undefined,
    unreasonablePermissions: unreasonablePermissions.length > 0 ? unreasonablePermissions : undefined,
    broadHostPatterns: broadHostPatterns.length > 0 ? broadHostPatterns : undefined,
  };
}

// =============================================================================
// MAIN NORMALIZER
// =============================================================================

/**
 * Normalize a raw scan result into a ReportViewModel
 * 
 * @param raw - The raw API response
 * @returns ReportViewModel - Normalized data for UI consumption
 * @throws Error if critical fields are missing (extensionId)
 */
export function normalizeScanResult(raw: RawScanResult): ReportViewModel {
  // Validate critical fields
  // Support both snake_case (raw API) and camelCase (formatted data)
  const extensionId = raw.extension_id || (raw as unknown as { extensionId?: string }).extensionId;
  if (!extensionId) {
    console.error('[normalizeScanResult] Missing extension_id in raw result');
    throw new Error('Invalid scan result: missing extension_id');
  }
  
  // Get scoring v2 data (primary source)
  const scoringV2 = getScoringV2(raw);
  
  // Cast to support both raw API fields and formatted camelCase fields
  const formatted = raw as unknown as {
    name?: string;
    version?: string;
    securityScore?: number;
    riskLevel?: string;
  };
  
  // Build meta information
  const meta: MetaVM = {
    extensionId,
    name: raw.extension_name || formatted.name || raw.metadata?.title || raw.manifest?.name || 'Unknown Extension',
    iconUrl: undefined, // Not in current API, could be added later
    version: raw.metadata?.version || raw.manifest?.version || formatted.version,
    updatedAt: raw.metadata?.last_updated,
    users: raw.metadata?.user_count,
    rating: raw.metadata?.rating,
    ratingCount: raw.metadata?.ratings_count,
    storeUrl: raw.url,
    scanTimestamp: raw.timestamp,
  };
  
  // Build scores
  const decision = normalizeDecision(
    scoringV2?.decision || raw.decision_v2 || raw.governance_verdict
  );
  
  // Use decision-based bands if decision exists, otherwise score-based
  const useBandFromDecision = decision !== null;
  
  // Get scores from scoring_v2 or fallback to legacy (also support formatted camelCase)
  const securityScore = scoringV2?.security_score ?? raw.security_score ?? raw.overall_security_score ?? formatted.securityScore ?? null;
  const privacyScore = scoringV2?.privacy_score ?? raw.privacy_score ?? null;
  const governanceScore = scoringV2?.governance_score ?? raw.governance_score ?? null;
  const overallScore = scoringV2?.overall_score ?? raw.overall_security_score ?? formatted.securityScore ?? null;
  const overallConfidence = scoringV2?.overall_confidence ?? raw.overall_confidence ?? null;
  
  const scores: ScoresVM = {
    security: {
      score: securityScore,
      band: useBandFromDecision ? bandFromDecision(decision) : bandFromScore(securityScore),
      confidence: scoringV2?.security_layer?.confidence ?? null,
    },
    privacy: {
      score: privacyScore,
      band: useBandFromDecision ? bandFromDecision(decision) : bandFromScore(privacyScore),
      confidence: scoringV2?.privacy_layer?.confidence ?? null,
    },
    governance: {
      score: governanceScore,
      band: useBandFromDecision ? bandFromDecision(decision) : bandFromScore(governanceScore),
      confidence: scoringV2?.governance_layer?.confidence ?? null,
    },
    overall: {
      score: overallScore,
      band: useBandFromDecision ? bandFromDecision(decision) : bandFromScore(overallScore),
      confidence: overallConfidence,
    },
    decision,
    reasons: scoringV2?.decision_reasons || scoringV2?.reasons || raw.decision_reasons_v2 || [],
  };
  
  // Build factors by layer
  const factorsByLayer: FactorsByLayerVM = {
    security: getLayerFactors(scoringV2?.security_layer),
    privacy: getLayerFactors(scoringV2?.privacy_layer),
    governance: getLayerFactors(scoringV2?.governance_layer),
  };
  
  // Build key findings
  const keyFindings = buildKeyFindings(scoringV2, raw);
  
  // Build permissions
  const permissions = buildPermissions(raw);
  
  // Build evidence index
  const evidenceIndex = buildEvidenceIndex(raw);

  // Map consumer insights (from backend report_view_model or top-level fallback)
  const consumerRaw = raw?.report_view_model?.consumer_insights || raw?.consumer_insights;
  const consumerInsights: ConsumerInsights | undefined = (
    consumerRaw && typeof consumerRaw === 'object'
  ) ? {
    safety_label: Array.isArray(consumerRaw.safety_label) ? consumerRaw.safety_label : [],
    scenarios: Array.isArray(consumerRaw.scenarios) ? consumerRaw.scenarios : [],
    top_drivers: Array.isArray(consumerRaw.top_drivers) ? consumerRaw.top_drivers : [],
  } : undefined;
  
  return {
    meta,
    scores,
    factorsByLayer,
    keyFindings,
    permissions,
    evidenceIndex,
    consumerInsights,
  };
}

/**
 * Safe normalizer that returns null instead of throwing
 * Use this when you want to handle missing data gracefully
 */
export function normalizeScanResultSafe(raw: RawScanResult | null | undefined): ReportViewModel | null {
  if (!raw) {
    console.warn('[normalizeScanResultSafe] Received null or undefined raw result');
    return null;
  }
  
  try {
    return normalizeScanResult(raw);
  } catch (error) {
    console.error('[normalizeScanResultSafe] Failed to normalize scan result:', error);
    return null;
  }
}

/**
 * Create an empty/placeholder view model for loading states
 */
export function createEmptyReportViewModel(extensionId: string = ''): ReportViewModel {
  return {
    meta: {
      extensionId,
      name: 'Loading...',
    },
    scores: {
      security: { score: null, band: 'NA', confidence: null },
      privacy: { score: null, band: 'NA', confidence: null },
      governance: { score: null, band: 'NA', confidence: null },
      overall: { score: null, band: 'NA', confidence: null },
      decision: null,
      reasons: [],
    },
    factorsByLayer: {
      security: [],
      privacy: [],
      governance: [],
    },
    keyFindings: [],
    permissions: {},
    evidenceIndex: {},
  };
}

/**
 * Check if a ReportViewModel has scoring data
 */
export function hasScoring(vm: ReportViewModel): boolean {
  return vm.scores.overall.score !== null;
}

/**
 * Check if a ReportViewModel has scoring_v2 data (vs legacy)
 */
export function hasScoringV2(vm: ReportViewModel): boolean {
  return (
    vm.scores.security.confidence !== null ||
    vm.scores.privacy.score !== null ||
    vm.scores.governance.score !== null
  );
}

/**
 * Collect all evidence IDs referenced in the view model
 */
export function collectReferencedEvidenceIds(vm: ReportViewModel): string[] {
  const ids = new Set<string>();
  
  // From factors
  [...vm.factorsByLayer.security, ...vm.factorsByLayer.privacy, ...vm.factorsByLayer.governance]
    .forEach((factor) => {
      factor.evidenceIds.forEach((id) => ids.add(id));
    });
  
  // From key findings
  vm.keyFindings.forEach((finding) => {
    finding.evidenceIds.forEach((id) => ids.add(id));
  });
  
  return Array.from(ids);
}

/**
 * Validate evidence integrity - warns if evidence_ids are referenced but evidenceIndex is empty
 * Call this after normalization to detect data issues early
 */
export function validateEvidenceIntegrity(vm: ReportViewModel): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  const referencedIds = collectReferencedEvidenceIds(vm);
  const indexKeys = Object.keys(vm.evidenceIndex);
  
  // Check if evidence_ids exist but evidenceIndex is empty
  if (referencedIds.length > 0 && indexKeys.length === 0) {
    const warning = `Evidence IDs exist (${referencedIds.length}) but evidenceIndex is empty`;
    console.warn(`[validateEvidenceIntegrity] ${warning}`);
    warnings.push(warning);
  }
  
  // Check for orphaned evidence IDs (referenced but not in index)
  const orphanedIds = referencedIds.filter((id) => !vm.evidenceIndex[id]);
  if (orphanedIds.length > 0 && indexKeys.length > 0) {
    const warning = `${orphanedIds.length} evidence ID(s) referenced but not found in evidenceIndex: ${orphanedIds.slice(0, 3).join(', ')}${orphanedIds.length > 3 ? '...' : ''}`;
    console.warn(`[validateEvidenceIntegrity] ${warning}`);
    warnings.push(warning);
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Check if we're in development mode
 */
export function isDevelopmentMode(): boolean {
  try {
    // Vite dev mode check
    return import.meta.env?.DEV === true || import.meta.env?.MODE === 'development';
  } catch {
    // Fallback for non-Vite environments
    return process.env.NODE_ENV === 'development';
  }
}

// Default export
export default normalizeScanResult;

