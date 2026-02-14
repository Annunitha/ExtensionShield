import React from 'react';
import './ResultsSidebarTile.scss';

/**
 * ResultsSidebarTile - Right sidebar tile for Security/Privacy/Governance
 * Findings count is more prominent than % (enterprise design)
 */
const ResultsSidebarTile = ({
  title = 'Layer',
  score = null,
  band = 'NA',
  findingsCount = 0,
  icon = null,
  onClick = null
}) => {
  const getBandColor = () => {
    switch (band) {
      case 'GOOD': return 'var(--risk-good)';
      case 'WARN': return 'var(--risk-warn)';
      case 'BAD': return 'var(--risk-bad)';
      default: return 'var(--risk-neutral)';
    }
  };

  const getBandLabel = () => {
    switch (band) {
      case 'GOOD': return 'Good';
      case 'WARN': return 'Review';
      case 'BAD': return 'Bad';
      default: return 'N/A';
    }
  };

  const getBandIcon = () => {
    switch (band) {
      case 'GOOD': return '✓';
      case 'WARN': return '⚡';
      case 'BAD': return '✕';
      default: return '−';
    }
  };

  const getLayerIcon = () => {
    if (icon) return icon;
    switch (title.toLowerCase()) {
      case 'security': return '🛡️';
      case 'privacy': return '🔒';
      case 'governance': return '📋';
      default: return '📊';
    }
  };

  const color = getBandColor();
  const displayScore = score === null ? '--' : Math.round(score);

  return (
    <div
      className={`results-sidebar-tile band-${band.toLowerCase()} ${onClick ? 'is-clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
    >
      {/* Row 1: Logo + Name + click hint when clickable */}
      <div className="tile-header">
        <span className="tile-icon">{getLayerIcon()}</span>
        <h3 className="tile-title">{title}</h3>
        {onClick && <span className="tile-click-hint" aria-hidden>Click for details</span>}
      </div>
      {/* Row 2: Big percentage + findings (right) */}
      <div className="tile-percent-row">
        <span className="tile-percent" style={{ color }}>{displayScore}%</span>
        <span className="tile-findings">
          <strong>{findingsCount}</strong> findings
        </span>
      </div>
      {/* Row 3: Review/Good pill */}
      <div className="tile-pill-row">
        <span className={`tile-pill tile-pill-${band.toLowerCase()}`}>
          <span className="pill-icon">{getBandIcon()}</span>
          {getBandLabel()}
        </span>
      </div>
      {/* Row 4: Status bar */}
      <div className="tile-progress">
        <div
          className="tile-progress-fill"
          style={{ width: `${displayScore === '--' ? 0 : displayScore}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
};

export default ResultsSidebarTile;
