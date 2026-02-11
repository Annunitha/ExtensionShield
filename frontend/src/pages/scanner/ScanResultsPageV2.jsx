import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  RiskDial,
  ReportScoreCard,
  FactorBars,
  EvidenceDrawer,
  PermissionsPanel,
  SummaryPanel,
  LayerModal,
} from "../../components/report";
import FileViewerModal from "../../components/FileViewerModal";
import StatusMessage from "../../components/StatusMessage";
import { useScan } from "../../context/ScanContext";
import realScanService from "../../services/realScanService";
import { normalizeScanResultSafe, validateEvidenceIntegrity, gateIdToLayer, extractFindingsByLayer } from "../../utils/normalizeScanResult";
import { getExtensionIconUrl, EXTENSION_ICON_PLACEHOLDER } from "../../utils/constants";
import "./ScanResultsPageV2.scss";

/**
 * ScanResultsPageV2 - Redesigned results dashboard
 * Uses ReportViewModel from normalizeScanResultSafe() - NO fake data
 */
const ScanResultsPageV2 = () => {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const {
    scanResults,
    error,
    setError,
    loadResultsById,
    currentExtensionId,
  } = useScan();

  const [isLoading, setIsLoading] = useState(false);
  const [rawData, setRawData] = useState(null);
  const [viewModel, setViewModel] = useState(null);
  const [normalizationError, setNormalizationError] = useState(null);
  const [showHeroIcon, setShowHeroIcon] = useState(true);
  const [fileViewerModal, setFileViewerModal] = useState({
    isOpen: false,
    file: null,
  });
  
  // Evidence drawer state
  const [evidenceDrawer, setEvidenceDrawer] = useState({
    open: false,
    evidenceIds: [],
  });

  // Layer modal state
  const [layerModal, setLayerModal] = useState({
    open: false,
    layer: null, // 'security' | 'privacy' | 'governance'
  });

  // Track which scanId we've loaded to prevent double loading
  const loadedScanIdRef = useRef(null);
  const isLoadingRef = useRef(false);

  // Clear stale local state immediately when scanId changes so previous
  // extension's report never flashes while the new one loads.
  useEffect(() => {
    if (loadedScanIdRef.current !== scanId) {
      loadedScanIdRef.current = null;
      isLoadingRef.current = false;
      // Reset local derived state so stale data from the previous extension
      // is never shown while the new extension's data loads.
      setViewModel(null);
      setRawData(null);
      setNormalizationError(null);
      setShowHeroIcon(true);
    }
  }, [scanId]);

  // Load results - always fetch from API when scanId changes
  useEffect(() => {
    let cancelled = false;

    const loadResults = async () => {
      // Prevent double loading for the same scanId
      if (isLoadingRef.current || loadedScanIdRef.current === scanId) {
        return;
      }

      isLoadingRef.current = true;
      setIsLoading(true);

      try {
        const data = await loadResultsById(scanId);
        if (!cancelled) {
          loadedScanIdRef.current = scanId;
        }
      } finally {
        if (!cancelled) {
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    };

    loadResults();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, loadResultsById]);

  // NOTE: Redirect to /extension/:id/version/:hash disabled until backend implements GET /api/extension/:id/version/:hash
  // When that API exists, uncomment to redirect for canonical URLs
  // useEffect(() => {
  //   if (scanResults?.extension_id && scanResults?.build_hash) {
  //     const canonicalUrl = `/extension/${scanResults.extension_id}/version/${scanResults.build_hash}`;
  //     if (!window.location.pathname.includes('/extension/')) {
  //       navigate(canonicalUrl, { replace: true });
  //     }
  //   }
  // }, [scanResults, navigate]);

  // Normalize scan results when they change (runs synchronously; viewModel set in same effect)
  useEffect(() => {
    if (scanResults) {
      setRawData(scanResults);

      // ── DEBUG (dev only): raw payload inspection ── (commented for prod: no console)
      // if (process.env.NODE_ENV === "development") {
      //   console.group("[DEBUG ScanResultsPageV2] RAW payload inspection");
      //   console.log("raw keys:", Object.keys(scanResults || {}));
      //   console.log("raw.report_view_model keys:", Object.keys(scanResults?.report_view_model || {}));
      //   console.log("typeof raw.report_view_model.consumer_insights:", typeof scanResults?.report_view_model?.consumer_insights);
      //   console.log("typeof raw.consumer_insights:", typeof scanResults?.consumer_insights);
      //   console.log("raw.report_view_model.consumer_insights:", scanResults?.report_view_model?.consumer_insights);
      //   console.log("raw.report_view_model.consumerInsights (camelCase?):", scanResults?.report_view_model?.consumerInsights);
      //   console.log("raw.scoring_v2 exists?", typeof scanResults?.scoring_v2, scanResults?.scoring_v2 ? Object.keys(scanResults.scoring_v2) : "N/A");
      //   console.groupEnd();
      // }

      // Use safe normalizer - never throws (synchronous)
      const vm = normalizeScanResultSafe(scanResults);
      setViewModel(vm);

      // ── DEBUG (dev only): post-normalization inspection ── (commented for prod: no console)
      // if (process.env.NODE_ENV === "development") {
      //   console.group("[DEBUG ScanResultsPageV2] POST-NORMALIZATION inspection");
      //   console.log("viewModel keys:", Object.keys(vm || {}));
      //   console.log("typeof viewModel.consumerInsights:", typeof vm?.consumerInsights);
      //   console.log("viewModel.consumerInsights:", vm?.consumerInsights);
      //   console.log("viewModel.reportViewModel?.consumer_insights:", vm?.reportViewModel?.consumer_insights);
      //   console.log("!!viewModel.consumerInsights:", !!vm?.consumerInsights);
      //   console.log("!!raw.report_view_model.consumer_insights:", !!scanResults?.report_view_model?.consumer_insights);
      //   const ci = vm?.consumerInsights;
      //   if (ci) {
      //     console.log("consumerInsights.safety_label.length:", Array.isArray(ci.safety_label) ? ci.safety_label.length : "not array");
      //     console.log("consumerInsights.scenarios.length:", Array.isArray(ci.scenarios) ? ci.scenarios.length : "not array");
      //     console.log("consumerInsights.top_drivers.length:", Array.isArray(ci.top_drivers) ? ci.top_drivers.length : "not array");
      //   } else {
      //     console.log("consumerInsights is undefined/null");
      //   }
      //   console.groupEnd();
      // }
      
      if (!vm) {
        setNormalizationError("Failed to normalize scan result data");
        // console.error("[ScanResultsPageV2] normalizeScanResultSafe returned null"); // prod: no console
      } else {
        setNormalizationError(null);
        
        // Validate evidence integrity
        const validation = validateEvidenceIntegrity(vm);
        if (!validation.valid) {
          validation.warnings.forEach(warning => {
            // console.warn(`[ScanResultsPageV2] Evidence warning: ${warning}`); // prod: no console
          });
        }
      }
    }
  }, [scanResults]);

  const handleViewFile = (file) => {
    setFileViewerModal({ isOpen: true, file });
  };

  const getFileContent = async (extensionId, filePath) => {
    return await realScanService.getFileContent(extensionId, filePath);
  };

  const openEvidenceDrawer = (evidenceIds) => {
    if (evidenceIds && evidenceIds.length > 0) {
      setEvidenceDrawer({ open: true, evidenceIds });
    }
  };

  const closeEvidenceDrawer = () => {
    setEvidenceDrawer({ open: false, evidenceIds: [] });
  };

  const openLayerModal = (layer) => {
    setLayerModal({ open: true, layer });
  };

  const closeLayerModal = () => {
    setLayerModal({ open: false, layer: null });
  };

  const extensionIdForIcon = viewModel?.meta?.extensionId || scanId;
  const heroIconUrl = extensionIdForIcon ? getExtensionIconUrl(extensionIdForIcon) : null;

  // Reset icon visibility when viewing a different extension
  useEffect(() => {
    setShowHeroIcon(true);
  }, [extensionIdForIcon]);

  // Loading state
  if (isLoading || isLoadingRef.current) {
    return (
      <div className="results-v2">
        <div className="results-v2-loading">
          <div className="loading-pulse" />
          <h2>Loading Results</h2>
          <p>Fetching scan data...</p>
          <code>{scanId}</code>
          {error && (
            <div className="loading-error" style={{ marginTop: '1rem', color: '#ef4444' }}>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // No results
  if (!scanResults && !isLoading && !isLoadingRef.current) {
    return (
      <div className="results-v2">
        <nav className="results-v2-nav">
          <Link to="/scan" className="nav-back">← Back</Link>
        </nav>
        <div className="results-v2-empty">
          <div className="empty-icon">📋</div>
          <h2>No Results Found</h2>
          <p>This extension hasn't been scanned yet or the scan is still in progress.</p>
          {error && (
            <div className="empty-error" style={{ marginTop: '1rem', color: '#ef4444' }}>
              {error}
            </div>
          )}
          <div className="empty-actions">
            <Button onClick={() => navigate("/scan")} variant="default">
              Start Scan
            </Button>
            <Button onClick={() => navigate(`/scan/progress/${scanId}`)} variant="outline" style={{ marginLeft: '0.5rem' }}>
              Check Progress
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Normalization failed - show error state
  if (!viewModel && normalizationError) {
    return (
      <div className="results-v2">
        <nav className="results-v2-nav">
          <Link to="/scan" className="nav-back">← Back</Link>
        </nav>
        <div className="results-v2-error">
          <div className="error-icon">⚠️</div>
          <h2>Report Data Unavailable</h2>
          <p>{normalizationError}</p>
          <div className="error-extension-id">
            <span>Extension ID:</span>
            <code>{scanId}</code>
          </div>
          {process.env.NODE_ENV === 'development' && rawData && (
            <details className="error-raw-data">
              <summary>Raw Data (Dev Only)</summary>
              <pre>{JSON.stringify(rawData, null, 2)}</pre>
            </details>
          )}
          <div className="error-actions">
            <Button onClick={() => navigate("/scan")}>Back to Scanner</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Extract data from viewModel - provide safe defaults
  const { meta, scores, factorsByLayer, keyFindings, permissions, evidenceIndex } = viewModel || {
    meta: {},
    scores: {},
    factorsByLayer: {},
    keyFindings: [],
    permissions: {},
    evidenceIndex: {}
  };

  // Extract all findings by layer from raw scan results (includes SAST, factors, gates, etc.)
  const findingsByLayer = extractFindingsByLayer(scanResults);
  
  // Combine keyFindings with extracted findings, deduplicating by title
  const allSecurityFindings = [
    ...(keyFindings?.filter(f => f.layer === 'security') || []),
    ...findingsByLayer.security,
  ];
  const allPrivacyFindings = [
    ...(keyFindings?.filter(f => f.layer === 'privacy') || []),
    ...findingsByLayer.privacy,
  ];
  const allGovernanceFindings = [
    ...(keyFindings?.filter(f => f.layer === 'governance') || []),
    ...findingsByLayer.governance,
  ];

  // Deduplicate findings by title
  const dedupeFindings = (findings) => {
    const seen = new Set();
    return findings.filter(f => {
      const key = f.title?.toLowerCase() || '';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  // ── TEMP DEBUG (3): booleans for UI banner ──
  // Commented out debug panel - uncomment to re-enable
  // For API reference, see: docs/SCORING_ENGINE_DOCUMENTATION.md (API Response Structure section)
  // API endpoint: GET /api/scan/results/{extension_id}
  // const _dbgHasRawCI = !!rawData?.report_view_model?.consumer_insights;
  // const _dbgHasNormCI = !!viewModel?.consumerInsights;
  // const _dbgHasScanId = !!scanId;
  // const _dbgHasReportViewModel = !!rawData?.report_view_model;
  // const _dbgHasScoringV2 = !!rawData?.scoring_v2 || !!rawData?.governance_bundle?.scoring_v2;
  // const _dbgLastFetchStatus = scanResults ? "success" : (error ? "error" : "pending");
  // const _dbgErrorMessage = error || null;

  // Brief transition: scanResults loaded but viewModel not yet set (effect runs after render)
  // Show loading state to avoid flash of "Unable to Display" - normalization is synchronous, next render will have viewModel
  if (!viewModel && scanResults && !normalizationError) {
    return (
      <div className="results-v2">
        <div className="results-v2-loading">
          <div className="loading-pulse" />
          <h2>Formatting Results</h2>
          <p>Preparing your report...</p>
        </div>
      </div>
    );
  }

  // Normalization failed - show error state
  if (!viewModel && scanResults && normalizationError) {
    return (
      <div className="results-v2">
        <nav className="results-v2-nav">
          <Link to="/scan" className="nav-back">← Back</Link>
        </nav>
        <div className="results-v2-error">
          <div className="error-icon">⚠️</div>
          <h2>Unable to Display Results</h2>
          <p>The scan data is available but couldn't be formatted for display.</p>
          <div className="error-actions">
            <Button onClick={() => navigate("/scan")}>Back to Scanner</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="results-v2">
      {/* ── TEMP DEBUG BANNER ── */}
      {/* Commented out debug panel - uncomment to re-enable
          For API reference, see: docs/SCORING_ENGINE_DOCUMENTATION.md (API Response Structure section)
          API endpoint: GET /api/scan/results/{extension_id}
      <div style={{
        position: 'sticky', top: 0, zIndex: 9999,
        background: '#1e293b', border: '2px solid #f59e0b',
        borderRadius: 8, padding: '12px 16px', marginBottom: 12,
        fontFamily: 'monospace', fontSize: 12, color: '#fbbf24',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12, lineHeight: 1.6
      }}>
        <div><b>lastFetchStatus:</b> {_dbgLastFetchStatus}</div>
        <div><b>hasScanId:</b> {String(_dbgHasScanId)}</div>
        <div><b>hasReportViewModel:</b> {String(_dbgHasReportViewModel)}</div>
        <div><b>hasScoringV2:</b> {String(_dbgHasScoringV2)}</div>
        <div><b>hasRawConsumerInsights:</b> {String(_dbgHasRawCI)}</div>
        <div><b>hasNormalizedConsumerInsights:</b> {String(_dbgHasNormCI)}</div>
        {_dbgErrorMessage && <div style={{ gridColumn: '1 / -1', color: '#ef4444' }}><b>errorMessage:</b> {_dbgErrorMessage}</div>}
        {!rawData && <div style={{ gridColumn: '1 / -1', color: '#ef4444' }}><b>WARNING:</b> rawData is null - top-level keys unavailable</div>}
        {rawData && (
          <div style={{ gridColumn: '1 / -1', fontSize: 11, marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(251, 191, 36, 0.2)' }}>
            <b>Top-level keys:</b> {Object.keys(rawData).slice(0, 15).join(', ')}{Object.keys(rawData).length > 15 ? '...' : ''}
          </div>
        )}
      </div>
      */}

      {/* Navigation Bar */}
      <nav className="results-v2-nav">
        <Link to="/scan" className="nav-back">
          ← Back
        </Link>
        <div className="nav-actions">
          <Button
            variant="default"
            size="sm"
            onClick={() => navigate("/scan")}
          >
            New Scan
          </Button>
        </div>
      </nav>

      {/* Hero Section - Risk Dial Centered */}
      <header className="results-v2-hero">
        {/* Extension Name with Icon - Above Dial */}
        <div className="hero-extension-info">
          <div className="hero-header">
            {showHeroIcon && heroIconUrl && (
              <img
                src={heroIconUrl}
                alt={`${meta?.name || "Extension"} icon`}
                className="hero-icon"
                loading="lazy"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = EXTENSION_ICON_PLACEHOLDER;
                }}
              />
            )}
            <h1 className="hero-title">{meta?.name || "Extension Analysis"}</h1>
          </div>
        </div>

        {/* Risk Dial - Centered Focal Point */}
        <div className="hero-dial-container">
          <RiskDial 
            score={scores?.overall?.score ?? scores?.security?.score ?? 0} 
            band={scores?.overall?.band || scores?.security?.band || 'NA'}
            label="SAFETY SCORE"
            decision={scores?.decision}
            size={320}
          />
        </div>

        {/* Extension Metadata - Below Dial */}
        <div className="hero-metadata">
          {meta?.users && (
            <span className="meta-item">
              <span className="meta-icon">👥</span>
              {meta.users.toLocaleString()} users
            </span>
          )}
          {meta?.rating && (
            <span className="meta-item">
              <span className="meta-icon">⭐</span>
              {meta.rating.toFixed(1)} rating
            </span>
          )}
          {scanResults?.developer && (
            <span className="meta-item">
              <span className="meta-icon">👤</span>
              {scanResults.developer}
            </span>
          )}
          {meta?.scanTimestamp && (
            <span className="meta-item meta-item-muted">
              Scanned {new Date(meta.scanTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
        </div>
      </header>

      {/* Status Messages */}
      {error && (
        <StatusMessage
          type="error"
          message={error}
          onDismiss={() => setError("")}
        />
      )}

      {/* Main Content */}
      <main className="results-v2-main">
        {/* Score Cards Row - Clickable tiles */}
        <section className="scores-section">
          <ReportScoreCard 
            title="Security"
            score={scores?.security?.score}
            band={scores?.security?.band || 'NA'}
            confidence={scores?.security?.confidence}
            contributors={factorsByLayer?.security?.slice(0, 2) || []}
            onClick={() => scores?.security?.score != null && openLayerModal('security')}
          />
          {scores?.privacy?.score != null ? (
            <ReportScoreCard 
              title="Privacy"
              score={scores.privacy.score}
              band={scores.privacy.band || 'NA'}
              confidence={scores.privacy.confidence}
              contributors={factorsByLayer?.privacy?.slice(0, 2) || []}
              onClick={() => openLayerModal('privacy')}
            />
          ) : (
            <ReportScoreCard 
              title="Privacy"
              score={null}
              band="NA"
              icon="🔒"
            />
          )}
          {scores?.governance?.score != null ? (
            <ReportScoreCard 
              title="Governance"
              score={scores.governance.score}
              band={scores.governance.band || 'NA'}
              confidence={scores.governance.confidence}
              contributors={factorsByLayer?.governance?.slice(0, 2) || []}
              onClick={() => openLayerModal('governance')}
            />
          ) : (
            <ReportScoreCard 
              title="Governance"
              score={null}
              band="NA"
              icon="📋"
            />
          )}
        </section>

        {/* Summary Panel - Single merged summary with key findings */}
        <SummaryPanel 
          scores={scores}
          factorsByLayer={factorsByLayer}
          rawScanResult={scanResults}
          keyFindings={keyFindings}
          onViewEvidence={openEvidenceDrawer}
        />
      </main>

      {/* Evidence Drawer - Global, mounted once */}
      <EvidenceDrawer 
        open={evidenceDrawer.open}
        evidenceIds={evidenceDrawer.evidenceIds}
        evidenceIndex={evidenceIndex || {}}
        onClose={closeEvidenceDrawer}
      />

      {/* File Viewer Modal */}
      <FileViewerModal
        isOpen={fileViewerModal.isOpen}
        onClose={() => setFileViewerModal({ isOpen: false, file: null })}
        file={fileViewerModal.file}
        extensionId={meta?.extensionId || scanId}
        onGetFileContent={getFileContent}
      />

      {/* Layer Modals */}
      {layerModal.layer === 'security' && (
        <LayerModal
          open={layerModal.open}
          onClose={closeLayerModal}
          layer="security"
          score={scores?.security?.score}
          band={scores?.security?.band || 'NA'}
          factors={factorsByLayer?.security || []}
          powerfulPermissions={[
            ...(permissions?.highRiskPermissions || []).filter(p => 
              ['debugger', 'webRequestBlocking', 'nativeMessaging', 'proxy'].includes(p)
            ),
            ...(permissions?.broadHostPatterns || []),
          ]}
          keyFindings={dedupeFindings(allSecurityFindings)}
          gateResults={scanResults?.scoring_v2?.gate_results?.filter(g => g.triggered && gateIdToLayer(g.gate_id) === 'security') || []}
          layerReasons={scores?.reasons?.filter(r => r.toLowerCase().includes('security') || r.toLowerCase().includes('sast') || r.toLowerCase().includes('malware')) || []}
          onViewEvidence={openEvidenceDrawer}
        />
      )}

      {layerModal.layer === 'privacy' && (
        <LayerModal
          open={layerModal.open}
          onClose={closeLayerModal}
          layer="privacy"
          score={scores?.privacy?.score}
          band={scores?.privacy?.band || 'NA'}
          factors={factorsByLayer?.privacy || []}
          permissions={permissions}
          keyFindings={dedupeFindings(allPrivacyFindings)}
          gateResults={scanResults?.scoring_v2?.gate_results?.filter(g => g.triggered && gateIdToLayer(g.gate_id) === 'privacy') || []}
          layerReasons={scores?.reasons?.filter(r => r.toLowerCase().includes('privacy') || r.toLowerCase().includes('exfil') || r.toLowerCase().includes('tracking')) || []}
          onViewEvidence={openEvidenceDrawer}
        />
      )}

      {layerModal.layer === 'governance' && (
        <LayerModal
          open={layerModal.open}
          onClose={closeLayerModal}
          layer="governance"
          score={scores?.governance?.score}
          band={scores?.governance?.band || 'NA'}
          factors={factorsByLayer?.governance || []}
          keyFindings={dedupeFindings(allGovernanceFindings)}
          gateResults={scanResults?.scoring_v2?.gate_results?.filter(g => g.triggered && gateIdToLayer(g.gate_id) === 'governance') || []}
          layerReasons={scores?.reasons?.filter(r => r.toLowerCase().includes('governance') || r.toLowerCase().includes('policy') || r.toLowerCase().includes('tos') || r.toLowerCase().includes('disclosure')) || []}
          onViewEvidence={openEvidenceDrawer}
        />
      )}
    </div>
  );
};

export default ScanResultsPageV2;
