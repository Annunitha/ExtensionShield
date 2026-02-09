import React from 'react';
import './KeyFindings.scss';

/**
 * KeyFindings - Displays key findings from the scan
 * 
 * Props from ReportViewModel:
 * - findings: KeyFindingVM[] - Array of key findings
 * - onViewEvidence: (evidenceIds: string[]) => void - Callback when clicking view evidence
 */
const KeyFindings = ({ 
  findings = [],
  onViewEvidence = null
}) => {
  // Don't render if no findings
  if (!findings || findings.length === 0) {
    return null;
  }

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'high': return '🚨';
      case 'medium': return '⚠️';
      case 'low': return '💡';
      default: return '📌';
    }
  };

  const getLayerIcon = (layer) => {
    switch (layer) {
      case 'security': return '🛡️';
      case 'privacy': return '🔒';
      case 'governance': return '📋';
      default: return '📊';
    }
  };

  const handleViewEvidence = (evidenceIds) => {
    if (onViewEvidence && evidenceIds && evidenceIds.length > 0) {
      onViewEvidence(evidenceIds);
    }
  };

  // Sort by severity (high > medium > low) and take top 2-3
  const sortedFindings = [...findings].sort((a, b) => {
    const severityOrder = { high: 3, medium: 2, low: 1 };
    return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
  }).slice(0, 3);

  // Don't render if no findings after filtering
  if (sortedFindings.length === 0) {
    return null;
  }

  return (
    <section className="key-findings-section">
      <h2 className="section-title">
        <span className="title-icon">🔍</span>
        Key Findings
        {findings.length > sortedFindings.length && (
          <span className="findings-count">{sortedFindings.length} of {findings.length}</span>
        )}
      </h2>

      <div className="findings-list">
        {sortedFindings.map((finding, idx) => (
          <div 
            key={idx} 
            className={`finding-item severity-${finding.severity}`}
          >
            <div className="finding-header">
              <span className="severity-chip">
                <span className="severity-icon">{getSeverityIcon(finding.severity)}</span>
                <span className="severity-text">{finding.severity}</span>
              </span>
              <span className="layer-chip">
                <span className="layer-icon">{getLayerIcon(finding.layer)}</span>
                <span className="layer-text">{finding.layer}</span>
              </span>
            </div>

            <h3 className="finding-title">{finding.title}</h3>
            
            {finding.summary && (
              <p className="finding-summary">{finding.summary}</p>
            )}

            {finding.evidenceIds && finding.evidenceIds.length > 0 && onViewEvidence && (
              <button 
                className="view-evidence-btn"
                onClick={() => handleViewEvidence(finding.evidenceIds)}
              >
                <span className="btn-icon">📄</span>
                View Evidence ({finding.evidenceIds.length})
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export default KeyFindings;

