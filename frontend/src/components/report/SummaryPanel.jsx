import React from 'react';
import './SummaryPanel.scss';
import { normalizeHighlights } from '../../utils/normalizeScanResult';

/**
 * SummaryPanel - Simplified consumer-friendly summary
 * 
 * NEW FORMAT (unified_summary):
 * - headline: One sentence takeaway
 * - tldr: 2-3 sentences explaining the situation
 * - concerns: Top 3 specific concerns
 * - recommendation: One actionable sentence
 * 
 * LEGACY FORMAT (consumer_summary):
 * - verdict + reasons + access + action
 * 
 * Falls back gracefully through multiple data sources.
 * 
 * topFindings: Array of { title, summary } - Top 3 findings for instant proof (one line each)
 * onViewRiskyPermissions, onViewNetworkDomains: Optional click handlers for action buttons
 */

// Factor names from scoring engine that are not actionable by themselves (no user-facing finding)
const FACTOR_ONLY_NAMES = new Set(['Maintenance', 'Webstore', 'Manifest']);
const CONTRIBUTION_ONLY = /^Contribution: \d+%$/;

function isActionableFinding(f) {
  if (!f || (!f.title && !f.summary)) return false;
  const title = (f.title || '').trim();
  const summary = (f.summary || '').trim();
  const isFactorOnly = FACTOR_ONLY_NAMES.has(title) && CONTRIBUTION_ONLY.test(summary);
  return !isFactorOnly;
}

const SummaryPanel = ({
  scores = {},
  factorsByLayer = {},
  rawScanResult = null,
  keyFindings = [],
  onViewEvidence = null,
  topFindings = [],
  onViewRiskyPermissions = null,
  onViewNetworkDomains = null
}) => {
  // Show TOP 3 FINDINGS only when we have at least one actionable finding (not just factor labels)
  const actionableTopFindings = (topFindings || []).filter(isActionableFinding).slice(0, 3);

  // Priority 1: New unified_summary format (simpler, LLM-powered)
  const unifiedSummary = rawScanResult?.report_view_model?.unified_summary;
  
  // Priority 2: Legacy consumer_summary format
  const consumerSummary = rawScanResult?.report_view_model?.consumer_summary;
  
  // Priority 3: Fallback to highlights (keyPoints from LLM; keyFindings from SAST/engine preferred for concerns)
  const { oneLiner, keyPoints } = normalizeHighlights(rawScanResult);

  // SAST/engine keyFindings – use for Quick Summary concerns when they add value
  const engineConcerns = (keyFindings || [])
    .filter(f => f.severity === 'high' || f.severity === 'medium')
    .slice(0, 4)
    .map(f => f.summary || f.title);

  const hasUnifiedSummary = unifiedSummary && (unifiedSummary.headline || unifiedSummary.tldr);
  const hasConsumerSummary = consumerSummary && consumerSummary.verdict;
  const hasLegacy = oneLiner || keyPoints.length > 0 || engineConcerns.length > 0;
  const hasAnySummary = hasUnifiedSummary || hasConsumerSummary || hasLegacy;
  const showPlaceholder = !hasAnySummary && (onViewRiskyPermissions || onViewNetworkDomains);

  const getDecisionBadge = () => {
    const decision = scores?.decision;
    if (!decision) return null;
    const badges = {
      'ALLOW': { label: 'SAFE', color: '#10B981', icon: '✓' },
      'WARN': { label: 'REVIEW', color: '#F59E0B', icon: '⚡' },
      'BLOCK': { label: 'BLOCKED', color: '#EF4444', icon: '✕' },
    };
    const badge = badges[decision] || badges['WARN'];
    return (
      <span className="decision-badge" style={{ backgroundColor: badge.color }}>
        <span className="badge-icon">{badge.icon}</span>
        <span className="badge-text">{badge.label}</span>
      </span>
    );
  };

  // Placeholder Quick Summary when no summary data (match design: description tags + action buttons)
  if (showPlaceholder) {
    return (
      <section className="summary-panel summary-panel--unified">
        <div className="summary-header">
          <h2 className="summary-title">
            <span className="title-icon">✨</span>
            Quick Summary
          </h2>
          {getDecisionBadge()}
        </div>
        <div className="summary-content">
          <div className="summary-placeholder-wrapper">
            <p className="summary-placeholder-line">This extension needs review before installing.</p>
            <p className="summary-placeholder-line">Avoid on sensitive sites (banking/email).</p>
          </div>
          {(onViewRiskyPermissions || onViewNetworkDomains) && (
            <div className="summary-action-buttons">
              {onViewRiskyPermissions && (
                <button type="button" className="summary-action-btn" onClick={onViewRiskyPermissions}>
                  <span className="action-dot" /> View risky permissions
                </button>
              )}
              {onViewNetworkDomains && (
                <button type="button" className="summary-action-btn" onClick={onViewNetworkDomains}>
                  <span className="action-dot" /> View network domains
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    );
  }

  if (!hasAnySummary) {
    return null;
  }

  // NEW: Unified summary – single cohesive narrative (no fragmented AI-looking sections)
  if (hasUnifiedSummary) {
    const { headline, narrative, tldr, concerns = [], recommendation } = unifiedSummary;

    // Prefer narrative when present – it weaves capabilities, concerns, and recommendation
    const hasNarrative = narrative && narrative.trim().length > 0;
    const showLegacySections = !hasNarrative;

    return (
      <section className="summary-panel summary-panel--unified">
        <div className="summary-header">
          <h2 className="summary-title">
            <span className="title-icon">✨</span>
            Quick Summary
          </h2>
          {getDecisionBadge()}
        </div>

        <div className="summary-content">
          {/* Headline – short takeaway */}
          {headline && (
            <div className="summary-headline-wrapper">
              <h3 className="summary-headline">{headline}</h3>
            </div>
          )}

          {/* Unified narrative – single flowing text (capabilities + concerns + recommendation) */}
          {hasNarrative && (
            <div className="summary-narrative-wrapper">
              <p className="summary-narrative">{narrative}</p>
            </div>
          )}

          {/* Legacy: separate sections when narrative not available */}
          {showLegacySections && tldr && (
            <div className="summary-tldr-wrapper">
              <p className="summary-tldr">{tldr}</p>
            </div>
          )}
          {showLegacySections && ((concerns && concerns.length > 0) || engineConcerns.length > 0) && (
            <div className="summary-section concerns-section">
              <h3 className="section-subtitle">
                <span className="subtitle-icon">⚠️</span>
                Key Concerns
              </h3>
              <ul className="concerns-list">
                {(concerns && concerns.length > 0 ? concerns : engineConcerns).map((concern, idx) => (
                  <li key={idx} className="concern-item">
                    <span className="concern-bullet">•</span>
                    <span className="concern-text">{concern}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {showLegacySections && recommendation && (
            <div className="summary-section recommendation-section">
              <div className="recommendation-card">
                <span className="recommendation-icon">👉</span>
                <span className="recommendation-text">{recommendation}</span>
              </div>
            </div>
          )}

          {/* Action buttons + Top 3 findings (dashboard layout) */}
          {(onViewRiskyPermissions || onViewNetworkDomains) && (
            <div className="summary-action-buttons">
              {onViewRiskyPermissions && (
                <button type="button" className="summary-action-btn" onClick={onViewRiskyPermissions}>
                  <span className="action-dot" /> View risky permissions
                </button>
              )}
              {onViewNetworkDomains && (
                <button type="button" className="summary-action-btn" onClick={onViewNetworkDomains}>
                  <span className="action-dot" /> View network domains
                </button>
              )}
            </div>
          )}
          {actionableTopFindings.length > 0 && (
            <div className="summary-top-findings">
              <h4 className="top-findings-title">TOP 3 FINDINGS</h4>
              <ul className="top-findings-list">
                {actionableTopFindings.map((f, idx) => (
                  <li key={idx} className="top-finding-item">
                    {f.summary || f.title || String(f)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    );
  }

  // Legacy consumer_summary layout
  if (hasConsumerSummary) {
    const { verdict, reasons = [], access, action } = consumerSummary;

    return (
      <section className="summary-panel">
        <div className="summary-header">
          <h2 className="summary-title">
            <span className="title-icon">✨</span>
            Quick Summary
          </h2>
          {getDecisionBadge()}
        </div>

        <div className="summary-content">
          {/* Verdict - the headline */}
          {verdict && (
            <div className="summary-verdict-wrapper">
              <p className="summary-verdict">{verdict}</p>
            </div>
          )}

          {/* Reasons - why this score */}
          {reasons.length > 0 && (
            <div className="summary-section key-reasons">
              <h3 className="section-subtitle">
                <span className="subtitle-icon">📌</span>
                Why This Score
              </h3>
              <div className="reasons-list">
                {reasons.map((reason, idx) => (
                  <div key={idx} className="reason-card">
                    <span className="reason-number">{idx + 1}</span>
                    <p className="reason-text">{reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Access - what it can access */}
          {access && (
            <div className="summary-section access-section">
              <h3 className="section-subtitle">
                <span className="subtitle-icon">🔑</span>
                What It Can Access
              </h3>
              <div className="access-card">
                <span className="access-text">{access}</span>
              </div>
            </div>
          )}

          {/* Action - what to do */}
          {action && (
            <div className="summary-section action-section">
              <h3 className="section-subtitle">
                <span className="subtitle-icon">👉</span>
                What to Do
              </h3>
              <div className="action-card">
                <span className="action-text">{action}</span>
              </div>
            </div>
          )}

          {(onViewRiskyPermissions || onViewNetworkDomains) && (
            <div className="summary-action-buttons">
              {onViewRiskyPermissions && (
                <button type="button" className="summary-action-btn" onClick={onViewRiskyPermissions}>
                  <span className="action-dot" /> View risky permissions
                </button>
              )}
              {onViewNetworkDomains && (
                <button type="button" className="summary-action-btn" onClick={onViewNetworkDomains}>
                  <span className="action-dot" /> View network domains
                </button>
              )}
            </div>
          )}
          {actionableTopFindings.length > 0 && (
            <div className="summary-top-findings">
              <h4 className="top-findings-title">TOP 3 FINDINGS</h4>
              <ul className="top-findings-list">
                {actionableTopFindings.map((f, idx) => (
                  <li key={idx} className="top-finding-item">
                    {f.summary || f.title || String(f)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    );
  }

  // Legacy highlights layout – prefer SAST/engine keyFindings over LLM keyPoints
  const concernsToShow = engineConcerns.length > 0 ? engineConcerns : keyPoints;

  return (
    <section className="summary-panel">
      <div className="summary-header">
        <h2 className="summary-title">
          <span className="title-icon">✨</span>
          Quick Summary
        </h2>
        {getDecisionBadge()}
      </div>

      <div className="summary-content">
        {/* One-liner summary */}
        {oneLiner && (
          <div className="summary-verdict-wrapper">
            <p className="summary-verdict">{oneLiner}</p>
          </div>
        )}

        {/* Key Concerns – from SAST/engine when available, else LLM keyPoints */}
        {concernsToShow.length > 0 && (
          <div className="summary-section key-reasons">
            <h3 className="section-subtitle">
              <span className="subtitle-icon">📌</span>
              Key Concerns
            </h3>
            <div className="reasons-list">
              {concernsToShow.map((point, idx) => (
                <div key={idx} className="reason-card">
                  <span className="reason-number">{idx + 1}</span>
                  <p className="reason-text">{point}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {(onViewRiskyPermissions || onViewNetworkDomains) && (
          <div className="summary-action-buttons">
            {onViewRiskyPermissions && (
              <button type="button" className="summary-action-btn" onClick={onViewRiskyPermissions}>
                <span className="action-dot" /> View risky permissions
              </button>
            )}
            {onViewNetworkDomains && (
              <button type="button" className="summary-action-btn" onClick={onViewNetworkDomains}>
                <span className="action-dot" /> View network domains
              </button>
            )}
          </div>
        )}
        {actionableTopFindings.length > 0 && (
          <div className="summary-top-findings">
            <h4 className="top-findings-title">TOP 3 FINDINGS</h4>
            <ul className="top-findings-list">
              {actionableTopFindings.map((f, idx) => (
                <li key={idx} className="top-finding-item">
                  {f.summary || f.title || String(f)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
};

export default SummaryPanel;
