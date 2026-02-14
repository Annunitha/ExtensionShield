import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import './LayerModal.scss';

// ---------------------------------------------------------------------------
// Human-readable translations for internal factor names
// ---------------------------------------------------------------------------
const FACTOR_HUMAN = {
  SAST:                 { label: 'Code Safety',           icon: '🔍', category: 'code',   desc: 'Checks the code for security problems' },
  VirusTotal:           { label: 'Malware Scan',          icon: '🦠', category: 'threat', desc: 'Checks if antivirus tools flag this extension' },
  Obfuscation:          { label: 'Hidden Code',           icon: '🫣', category: 'code',   desc: 'Some code is hidden or hard to read' },
  Manifest:             { label: 'Extension Config',      icon: '⚙️', category: 'code',   desc: 'How the extension is set up and configured' },
  ChromeStats:          { label: 'Threat Intelligence',   icon: '📡', category: 'threat', desc: 'Known security issues from Chrome data' },
  Webstore:             { label: 'Store Reputation',      icon: '🏪', category: 'trust',  desc: 'Ratings and reviews from the Chrome store' },
  Maintenance:          { label: 'Update Freshness',      icon: '📅', category: 'trust',  desc: 'When the extension was last updated' },
  PermissionsBaseline:  { label: 'Permission Risk',       icon: '🔑', category: 'access', desc: 'What the extension can access on your browser' },
  PermissionCombos:     { label: 'Dangerous Combos',      icon: '⚡', category: 'access', desc: 'Risky combinations of what it can do' },
  NetworkExfil:         { label: 'Data Sharing',          icon: '📤', category: 'data',   desc: 'Can it send your data to external servers?' },
  CaptureSignals:       { label: 'Screen / Tab Capture',  icon: '📹', category: 'data',   desc: 'Can record your screen or browser tabs' },
  ToSViolations:        { label: 'Policy Violations',     icon: '📜', category: 'policy', desc: 'Does it follow Chrome store rules?' },
  Consistency:          { label: 'Behavior Match',        icon: '🎯', category: 'policy', desc: 'Does it do what it says it does?' },
  DisclosureAlignment: { label: 'Disclosure Accuracy',   icon: '📋', category: 'policy', desc: 'Is the privacy policy accurate?' },
};

const CATEGORY_LABELS = {
  code:   'Code Checks',
  threat: 'Threat Detection',
  trust:  'Trust Signals',
  access: 'What It Can Access',
  data:   'Data Handling',
  policy: 'Rules & Policies',
};

const LAYER_CONFIG = {
  security: {
    title: 'Security',
    icon: '🛡️',
    tagline: 'Is the extension code safe to run?',
  },
  privacy: {
    title: 'Privacy',
    icon: '🔒',
    tagline: 'What can it see and where does your data go?',
  },
  governance: {
    title: 'Governance',
    icon: '📋',
    tagline: 'Does it follow the rules and match its claims?',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function humanizeFactor(factor) {
  const info = FACTOR_HUMAN[factor.name] || {
    label: factor.name,
    icon: '📊',
    category: 'other',
    desc: '',
  };
  const severity = factor.severity ?? 0;
  let level, levelColor;
  if (severity >= 0.7)      { level = 'High risk';   levelColor = 'var(--risk-bad)'; }
  else if (severity >= 0.4) { level = 'Medium risk';  levelColor = 'var(--risk-warn)'; }
  else if (severity >= 0.05){ level = 'Low risk';     levelColor = 'var(--risk-good)'; }
  else                      { level = 'Clear';        levelColor = 'var(--risk-good)'; }
  return { ...info, level, levelColor, severity, raw: factor };
}

function groupByCategory(items) {
  const groups = {};
  items.forEach(item => {
    const cat = item.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });
  Object.values(groups).forEach(g => g.sort((a, b) => b.severity - a.severity));
  return Object.entries(groups)
    .sort(([, a], [, b]) => Math.max(...b.map(x => x.severity)) - Math.max(...a.map(x => x.severity)));
}

function getSeverityClass(severity) {
  if (severity >= 0.7) return 'high';
  if (severity >= 0.4) return 'medium';
  if (severity >= 0.05) return 'low';
  return 'clear';
}

function bandColor(band) {
  switch (band) {
    case 'GOOD': return 'var(--risk-good)';
    case 'WARN': return 'var(--risk-warn)';
    case 'BAD':  return 'var(--risk-bad)';
    default:     return 'var(--risk-neutral)';
  }
}

function bandLabel(band) {
  switch (band) {
    case 'GOOD': return 'Good';
    case 'WARN': return 'Caution';
    case 'BAD':  return 'Bad';
    default:     return '';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const LayerModal = ({
  open,
  onClose,
  layer,
  score = null,
  band = 'NA',
  factors = [],
  keyFindings = [],
  gateResults = [],
  layerReasons = [],
  layerDetails = null,
  onViewEvidence = null,
}) => {
  const config = LAYER_CONFIG[layer] || LAYER_CONFIG.security;
  const displayScore = score === null ? '--' : Math.round(score);
  const bc = bandColor(band);
  const bl = bandLabel(band);

  // LLM plain-language one-liner (e.g. "High governance risk: violates Chrome Web Store policies")
  const ld = layerDetails?.[layer] || {};
  const oneLiner = ld.one_liner || '';

  // Risk Breakdown: categorised & humanised factors
  const humanised = factors.map(humanizeFactor);
  const grouped = groupByCategory(humanised);

  // Score ring: circumference ≈ 97.4 for r=15.5
  const ringCirc = 2 * Math.PI * 15.5;
  const ringOffset = score !== null ? (score / 100) * ringCirc : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="lm-content lm-dialog-smooth">
        <DialogHeader>
          <DialogTitle className="lm-header">
            <span className="lm-icon">{config.icon}</span>
            <span className="lm-title">{config.title}</span>
            <div className="lm-score-area">
              {/* Mini score ring – echoes risk dial */}
              {score !== null && (
                <div className="lm-score-ring" aria-hidden>
                  <svg viewBox="0 0 36 36" className="lm-ring-svg">
                    <path
                      className="lm-ring-bg"
                      d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
                      fill="none"
                      strokeWidth="3"
                    />
                    <path
                      className="lm-ring-fill"
                      stroke={bc}
                      strokeDasharray={`${ringOffset} ${ringCirc}`}
                      d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
                      fill="none"
                      strokeWidth="3"
                    />
                  </svg>
                  <span className="lm-ring-value" style={{ color: bc }}>{displayScore}</span>
                </div>
              )}
              <span className="lm-score" style={{ color: bc }}>
                {score !== null ? `${displayScore}/100` : displayScore}
              </span>
              {bl && <span className="lm-band" style={{ color: bc }}>{bl}</span>}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="lm-body">
          {/* One-liner: e.g. "High governance risk: violates Chrome Web Store policies" */}
          {oneLiner ? (
            <p className="lm-insight">{oneLiner}</p>
          ) : (
            <p className="lm-tagline">{config.tagline}</p>
          )}

          {/* Risk Breakdown - visual gauge cards by category */}
          {grouped.length > 0 && (
            <div className="lm-section lm-section-risk">
              <h3 className="lm-section-title">Risk Breakdown</h3>
              <div className="lm-categories">
                {grouped.map(([cat, items], catIdx) => (
                  <div key={cat} className="lm-cat" style={{ animationDelay: `${catIdx * 60}ms` }}>
                    <span className="lm-cat-label">{CATEGORY_LABELS[cat] || cat}</span>
                    <div className="lm-cat-items">
                      {items.map((item, idx) => (
                        <div
                          key={idx}
                          className={`lm-factor-card lm-severity-${getSeverityClass(item.severity)}`}
                          style={{ animationDelay: `${(catIdx * 60 + (idx + 1) * 40)}ms` }}
                        >
                          <div className="lm-factor-visual">
                            <span className="lm-factor-icon">{item.icon}</span>
                            <div className="lm-factor-gauge">
                              <div
                                className="lm-gauge-fill"
                                style={{
                                  width: `${Math.min(100, item.severity * 100)}%`,
                                  backgroundColor: item.levelColor,
                                }}
                              />
                            </div>
                          </div>
                          <div className="lm-factor-info">
                            <span className="lm-factor-label">{item.label}</span>
                            {item.desc && <span className="lm-factor-desc">{item.desc}</span>}
                          </div>
                          <span
                            className="lm-factor-badge"
                            style={{
                              color: item.levelColor,
                              borderColor: `${item.levelColor}40`,
                              backgroundColor: `${item.levelColor}12`,
                            }}
                          >
                            {item.level}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LayerModal;
