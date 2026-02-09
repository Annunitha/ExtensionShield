import React from 'react';
import './SummaryPanel.scss';
import { normalizeHighlights } from '../../utils/normalizeScanResult';

/**
 * SummaryPanel - Human-readable summary using LLM-generated content when available
 * 
 * Shows:
 * - One-liner summary (from LLM if available)
 * - Key points (from LLM why_this_score or fallback to deterministic)
 * - View details links (opens modals)
 * 
 * Props:
 * - scores: ScoresVM - Contains decision and reasons
 * - factorsByLayer: FactorsByLayerVM - All factors
 * - rawScanResult: RawScanResult - Raw scan data to access LLM summary
 * - onOpenModal: (layer: 'security' | 'privacy' | 'governance') => void
 */
const SummaryPanel = ({ 
  scores = {},
  factorsByLayer = {},
  rawScanResult = null,
  onOpenModal = null
}) => {
  // Use unified normalization helper for highlights
  const { oneLiner, keyPoints, whatToWatch } = normalizeHighlights(rawScanResult);

  // If we have no oneLiner and no keyPoints, it's really empty
  if (!oneLiner && keyPoints.length === 0) {
    return null;
  }

  const getDecisionBadge = () => {
    const decision = scores?.decision;
    if (!decision) return null;

    const badges = {
      'ALLOW': { label: 'Safe', color: '#10B981', icon: '✓' },
      'WARN': { label: 'Review', color: '#F59E0B', icon: '⚡' },
      'BLOCK': { label: 'Blocked', color: '#EF4444', icon: '✕' },
    };

    const badge = badges[decision] || badges['WARN'];
    return (
      <span 
        className="decision-badge"
        style={{ backgroundColor: badge.color }}
      >
        <span className="badge-icon">{badge.icon}</span>
        <span className="badge-text">{badge.label}</span>
      </span>
    );
  };

  return (
    <section className="summary-panel">
      <div className="summary-header">
        <h2 className="summary-title">
          <span className="title-icon">📋</span>
          Summary
        </h2>
        {getDecisionBadge()}
      </div>

      <div className="summary-content">
        {/* One-liner summary */}
        {oneLiner && (
          <p className="summary-one-liner">
            {oneLiner}
          </p>
        )}

        {/* Key Points - Single merged section */}
        <div className="summary-section key-points">
          {keyPoints.length > 0 ? (
            <ul className="summary-bullets">
              {keyPoints.map((point, idx) => (
                <li key={idx} className="bullet-item">
                  <span className="bullet-icon">•</span>
                  {point}
                </li>
              ))}
            </ul>
          ) : (
            <p className="placeholder-text">No key points available.</p>
          )}
        </div>

        {/* What to Watch (if available) */}
        {whatToWatch.length > 0 && (
          <div className="summary-section what-to-watch">
            <h3 className="section-subtitle">What to watch</h3>
            <ul className="summary-bullets">
              {whatToWatch.map((item, idx) => (
                <li key={idx} className="bullet-item">
                  <span className="bullet-icon">⚠️</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* View Details Links */}
        <div className="summary-actions">
          <span className="actions-label">View details:</span>
          <div className="action-links">
            {scores?.security?.score != null && (
              <button 
                className="action-link"
                onClick={() => onOpenModal && onOpenModal('security')}
              >
                <span className="link-icon">🛡️</span>
                Security
              </button>
            )}
            {scores?.privacy?.score != null && (
              <button 
                className="action-link"
                onClick={() => onOpenModal && onOpenModal('privacy')}
              >
                <span className="link-icon">🔒</span>
                Privacy
              </button>
            )}
            {scores?.governance?.score != null && (
              <button 
                className="action-link"
                onClick={() => onOpenModal && onOpenModal('governance')}
              >
                <span className="link-icon">📋</span>
                Governance
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SummaryPanel;

