import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Copy, Check, ChevronUp, ChevronDown, X } from "lucide-react";
import "./ScanHUD.scss";

const SCAN_STAGES = [
  { id: "extracting", label: "Unpack", progress: 14 },
  { id: "security_scan", label: "Static Analysis", progress: 28 },
  { id: "building_evidence", label: "Permissions", progress: 42 },
  { id: "applying_rules", label: "Compliance", progress: 71 },
  { id: "generating_report", label: "Report", progress: 100 },
];

// Map actual stages to user-friendly labels
const STAGE_LABEL_MAP = {
  extracting: "Unpack",
  security_scan: "Static Analysis",
  building_evidence: "Permissions",
  applying_rules: "Compliance",
  generating_report: "Report",
};

const ScanHUD = ({
  extensionIcon,
  extensionName,
  extensionId,
  scanStage,
  scanProgress = 0,
  gameStats = { score: 0, best: 0, time: 0 },
  onViewFindings,
  onCancelScan,
  isMobile = false,
  gameOver = false,
  scanComplete = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // Collapsed by default
  const [showCursor, setShowCursor] = useState(true); // For blinking cursor
  
  // Check if overlay is visible (game over or scan complete)
  const hasOverlay = gameOver || scanComplete;

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(extensionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Find current stage index
  const currentStageIndex = SCAN_STAGES.findIndex(
    (s) => s.id === scanStage
  );
  const currentStage =
    currentStageIndex >= 0
      ? SCAN_STAGES[currentStageIndex]
      : { id: scanStage || "extracting", label: STAGE_LABEL_MAP[scanStage] || "Starting...", progress: 0 };
  const progressPercentage =
    scanProgress > 0
      ? scanProgress
      : currentStageIndex >= 0
      ? SCAN_STAGES[currentStageIndex].progress
      : 0;

  // Blinking cursor effect
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  // Format time (seconds to MM:SS)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Get current stage label with blinking cursor
  const getStageLabel = () => {
    const label = currentStage.label || "Starting...";
    return (
      <>
        {label}
        <span className="scan-hud-cursor">{showCursor ? "_" : ""}</span>
      </>
    );
  };

  const content = (
    <>
      {/* Extension Info */}
      <div className="scan-hud-section">
        <div className="scan-hud-section-title">Extension</div>
        <div className="scan-hud-extension-info">
          <img
            src={extensionIcon}
            alt="Extension icon"
            className="scan-hud-extension-icon"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
          <div className="scan-hud-extension-details">
            <div className="scan-hud-extension-name">
              {extensionName || "Unknown Extension"}
            </div>
            <div className="scan-hud-extension-id-row">
              <code className="scan-hud-extension-id">
                {extensionId.length > 20
                  ? `${extensionId.substring(0, 20)}...`
                  : extensionId}
              </code>
              <button
                onClick={handleCopyId}
                className="scan-hud-copy-btn"
                title="Copy extension ID"
              >
                {copied ? (
                  <Check size={14} />
                ) : (
                  <Copy size={14} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scan Progress */}
      <div className="scan-hud-section">
        <div className="scan-hud-section-title">Scan Progress</div>
        <div className="scan-hud-progress-container">
          <div className="scan-hud-progress-bar">
            <div
              className="scan-hud-progress-fill"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="scan-hud-progress-info">
            <span className="scan-hud-progress-percentage">
              {Math.round(progressPercentage)}%
            </span>
            <span className="scan-hud-progress-stage scan-hud-terminal-text">
              {getStageLabel()}
            </span>
          </div>
        </div>
      </div>

      {/* Game Stats */}
      <div className="scan-hud-section">
        <div className="scan-hud-section-title">Game Stats</div>
        <div className="scan-hud-stats-grid">
          <div className="scan-hud-stat">
            <div className="scan-hud-stat-label">Score</div>
            <div className="scan-hud-stat-value">{Math.floor(gameStats.score || 0)}</div>
          </div>
          <div className="scan-hud-stat">
            <div className="scan-hud-stat-label">Best</div>
            <div className="scan-hud-stat-value">{Math.floor(gameStats.best || 0)}</div>
          </div>
          <div className="scan-hud-stat">
            <div className="scan-hud-stat-label">Time</div>
            <div className="scan-hud-stat-value">
              {formatTime(gameStats.time || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="scan-hud-section scan-hud-actions">
        <Button
          variant="outline"
          size="sm"
          onClick={onViewFindings}
          disabled={!scanProgress || scanProgress < 50}
          className="scan-hud-action-btn"
        >
          View Partial Findings
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancelScan}
          className="scan-hud-action-btn scan-hud-cancel-btn"
        >
          Cancel Scan
        </Button>
      </div>
    </>
  );

  // Collapsed rail content (shown when not expanded)
  const collapsedContent = (
    <div className="scan-hud-collapsed-content">
      <img
        src={extensionIcon}
        alt="Extension"
        className="scan-hud-collapsed-icon"
        onError={(e) => {
          e.target.style.display = "none";
        }}
      />
      <div className="scan-hud-collapsed-progress">
        <div className="scan-hud-collapsed-progress-bar">
          <div
            className="scan-hud-collapsed-progress-fill"
            style={{ height: `${progressPercentage}%` }}
          />
        </div>
        <span className="scan-hud-collapsed-percentage scan-hud-terminal-text">
          {Math.round(progressPercentage)}%
        </span>
      </div>
      <div className="scan-hud-collapsed-score scan-hud-terminal-text">
        {Math.floor(gameStats.score || 0)}
      </div>
      <button
        className="scan-hud-collapsed-cancel"
        onClick={(e) => {
          e.stopPropagation();
          onCancelScan();
        }}
        title="Cancel scan"
      >
        <X size={16} />
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <div className={`scan-hud scan-hud-mobile ${isExpanded ? "expanded" : ""}`}>
        <button
          className="scan-hud-mobile-toggle"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span>Scan Info</span>
          {isExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
        {isExpanded && <div className="scan-hud-mobile-content scan-hud-scanlines">{content}</div>}
      </div>
    );
  }

  return (
    <div
      className={`scan-hud scan-hud-desktop ${isExpanded ? "expanded" : "collapsed"} ${hasOverlay ? "overlay-visible" : ""}`}
      onMouseEnter={() => !hasOverlay && !isExpanded && setIsExpanded(true)}
      onMouseLeave={() => !hasOverlay && isExpanded && setIsExpanded(false)}
      style={hasOverlay ? { pointerEvents: 'none' } : {}}
    >
      {isExpanded ? (
        <div className="scan-hud-expanded-content scan-hud-scanlines">
          {content}
        </div>
      ) : (
        <div className="scan-hud-collapsed-wrapper" onClick={() => !hasOverlay && setIsExpanded(true)}>
          {collapsedContent}
        </div>
      )}
    </div>
  );
};

export default ScanHUD;

