import React from 'react';
import './FactorBars.scss';

/**
 * FactorBars - Horizontal bar visualization for risk factors
 * 
 * Props from ReportViewModel:
 * - title: string - Section title (e.g., "Security Factors")
 * - factors: FactorVM[] - Array of factors to display
 * - onViewEvidence: (evidenceIds: string[]) => void - Callback when clicking evidence
 */
const FactorBars = ({ 
  title = 'Factors',
  icon = null,
  factors = [],
  onViewEvidence = null
}) => {
  // Don't render if no factors
  if (!factors || factors.length === 0) {
    return null;
  }

  // Sort by riskContribution or severity (descending)
  const sortedFactors = [...factors].sort((a, b) => {
    const aValue = a.riskContribution ?? a.severity ?? 0;
    const bValue = b.riskContribution ?? b.severity ?? 0;
    return bValue - aValue;
  });

  const getBarColor = (severity) => {
    if (severity >= 0.7) return 'var(--risk-bad)';
    if (severity >= 0.4) return 'var(--risk-warn)';
    return 'var(--risk-good)';
  };

  const getBarWidth = (factor) => {
    // Use riskContribution if available, otherwise severity
    const value = factor.riskContribution ?? factor.severity ?? 0;
    // Clamp to 0-1 range and convert to percentage
    return Math.min(100, Math.max(5, value * 100));
  };

  const getConfidenceLabel = (confidence) => {
    if (confidence === null || confidence === undefined) return null;
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.5) return 'Med';
    return 'Low';
  };

  const handleViewEvidence = (evidenceIds) => {
    if (onViewEvidence && evidenceIds && evidenceIds.length > 0) {
      onViewEvidence(evidenceIds);
    }
  };

  return (
    <div className="factor-bars-section">
      <h3 className="factors-title">
        {icon && <span className="title-icon">{icon}</span>}
        {title}
        <span className="factors-count">{factors.length}</span>
      </h3>

      <div className="factors-list">
        {sortedFactors.map((factor, idx) => {
          const barWidth = getBarWidth(factor);
          const barColor = getBarColor(factor.severity);
          const confidenceLabel = getConfidenceLabel(factor.confidence);
          const hasEvidence = factor.evidenceIds && factor.evidenceIds.length > 0;

          return (
            <div key={idx} className="factor-item">
              <div className="factor-header">
                <span className="factor-name">{factor.name}</span>
                <div className="factor-meta">
                  {confidenceLabel && (
                    <span className="confidence-badge" title={`Confidence: ${Math.round((factor.confidence || 0) * 100)}%`}>
                      {confidenceLabel}
                    </span>
                  )}
                  {factor.weight !== undefined && (
                    <span className="weight-badge" title="Weight">
                      {Math.round(factor.weight * 100)}%
                    </span>
                  )}
                  {hasEvidence && onViewEvidence && (
                    <button 
                      className="evidence-link"
                      onClick={() => handleViewEvidence(factor.evidenceIds)}
                      title="View evidence"
                    >
                      📄 {factor.evidenceIds.length}
                    </button>
                  )}
                </div>
              </div>

              <div className="factor-bar-container">
                <div 
                  className="factor-bar-fill"
                  style={{ 
                    width: `${barWidth}%`,
                    backgroundColor: barColor
                  }}
                />
                <div 
                  className="factor-bar-glow"
                  style={{ 
                    width: `${barWidth}%`,
                    backgroundColor: barColor
                  }}
                />
              </div>

              <div className="factor-values">
                <span 
                  className="severity-value"
                  style={{ color: barColor }}
                >
                  {(factor.severity * 100).toFixed(0)}
                </span>
                {factor.riskContribution !== undefined && (
                  <span className="contribution-value">
                    +{(factor.riskContribution * 100).toFixed(1)}pts
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FactorBars;

