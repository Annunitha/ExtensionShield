import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  DonutScore,
  ResultsSidebarTile,
  EvidenceDrawer,
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

  // Normalize scan results when they change
  useEffect(() => {
    if (scanResults) {
      setRawData(scanResults);
      const vm = normalizeScanResultSafe(scanResults);
      setViewModel(vm);
      
      if (!vm) {
        setNormalizationError("Failed to normalize scan result data");
      } else {
        setNormalizationError(null);
        validateEvidenceIntegrity(vm);
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

  // Loading state - smooth shield animation
  if (isLoading || isLoadingRef.current) {
    return (
      <div className="results-v2">
        <div className="results-v2-loading">
          <div className="loading-shield">
            <span className="loading-shield-icon">🛡️</span>
            <div className="loading-shield-ring" />
            <div className="loading-shield-ring-outer" />
          </div>
          <h2>Analyzing Extension</h2>
          <p>Loading security report...</p>
          <div className="loading-progress-bar">
            <div className="loading-progress-fill" />
          </div>
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
            <div className="empty-error" style={{ marginTop: '1rem', color: 'var(--risk-bad)' }}>
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

  // Derive risk/feature labels for extension card (Obfuscation, Broad host access, Trackers)
  const getRiskLabels = () => {
    const labels = [];
    const allFactors = [
      ...(factorsByLayer?.security || []),
      ...(factorsByLayer?.privacy || []),
    ];
    const obfuscatedFiles = scanResults?.entropy_analysis?.obfuscated_files ?? 
      scanResults?.entropyAnalysis?.obfuscated_files ?? 0;
    const hasObfuscation = obfuscatedFiles > 0 || 
      allFactors.some(f => (f.name || '').toLowerCase().includes('obfuscat'));
    const hasTrackers = allFactors.some(f => 
      (f.name || '').toLowerCase().includes('tracker') || 
      (f.name || '').toLowerCase().includes('third')
    );
    const broadHost = permissions?.broadHostPatterns?.length > 0 || 
      (Array.isArray(scanResults?.manifest?.permissions) && scanResults.manifest.permissions.some(p => 
        typeof p === 'string' && (p.includes('<all_urls>') || p.includes('*://*/*'))
      ));
    if (hasObfuscation) labels.push({ label: 'Obfuscation', icon: '▶' });
    if (broadHost) labels.push({ label: 'Broad host access', icon: '◉' });
    if (hasTrackers) labels.push({ label: 'Trackers', icon: '◐' });
    return labels;
  };

  const riskLabels = getRiskLabels();

  // Top 3 findings for Quick Summary preview (one line each)
  const topThreeFindings = [
    ...dedupeFindings(allSecurityFindings),
    ...dedupeFindings(allPrivacyFindings),
    ...dedupeFindings(allGovernanceFindings),
  ]
    .slice(0, 3)
    .map(f => ({ title: f.title, summary: f.summary }));

  const securityFindingsCount = dedupeFindings(allSecurityFindings).length;
  const privacyFindingsCount = dedupeFindings(allPrivacyFindings).length;
  const governanceFindingsCount = dedupeFindings(allGovernanceFindings).length;

  // Brief transition: scanResults loaded but viewModel not yet set
  if (!viewModel && scanResults && !normalizationError) {
    return (
      <div className="results-v2">
        <div className="results-v2-loading">
          <div className="loading-shield">
            <span className="loading-shield-icon">🛡️</span>
            <div className="loading-shield-ring" />
            <div className="loading-shield-ring-outer" />
          </div>
          <h2>Preparing Report</h2>
          <p>Formatting security analysis...</p>
          <div className="loading-progress-bar">
            <div className="loading-progress-fill" />
          </div>
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

  const overallBand = scores?.overall?.band || scores?.security?.band || 'NA';
  const overallScore = scores?.overall?.score ?? scores?.security?.score ?? 0;

  return (
    <div className="results-v2 results-v2-dashboard">
      {/* Navigation Bar - Match screenshot: New scan, Share, Save */}
      <nav className="results-v2-nav">
        <Link to="/scan" className="nav-back">
          ← Back
        </Link>
        <div className="nav-actions">
          <Button variant="default" size="sm" onClick={() => navigate("/scan")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            New scan
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(window.location.href)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Share
          </Button>
          <Button variant="outline" size="sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
            </svg>
            Save
          </Button>
        </div>
      </nav>

      {/* Status Messages */}
      {error && (
        <StatusMessage type="error" message={error} onDismiss={() => setError("")} />
      )}

      {/* Main 2-column Layout: Left (Extension + Quick Summary) | Right (Score + Tiles) */}
      <main className="results-v2-main">
        <div className="results-v2-grid">
          {/* Left Column: Extension Card + Quick Summary with Top 3 findings */}
          <div className="results-v2-left">
            {/* Extension Details Card - Score donut inside, to the right */}
            <div className="extension-card">
              <div className="extension-card-inner">
                <div className="extension-card-left">
                  <div className="extension-card-header">
                    {showHeroIcon && heroIconUrl && (
                      <img
                        src={heroIconUrl}
                        alt=""
                        className="extension-card-icon"
                        loading="lazy"
                        onError={(e) => { e.target.onerror = null; e.target.src = EXTENSION_ICON_PLACEHOLDER; }}
                      />
                    )}
                    <h1 className="extension-card-title">{meta?.name || "Extension Analysis"}</h1>
                  </div>
                  <div className="extension-card-details">
                    <span className="ext-detail">
                      {showHeroIcon && heroIconUrl && (
                        <img src={heroIconUrl} alt="" className="ext-detail-icon" onError={(e) => { e.target.style.display = 'none'; }} />
                      )}
                      {meta?.name || "Extension"}
                    </span>
                    {meta?.users && (
                      <>
                        <span className="ext-divider" />
                        <span className="ext-detail">
                          <span className="ext-detail-icon">👥</span>
                          {meta.users.toLocaleString()} users
                        </span>
                      </>
                    )}
                    {meta?.rating != null && (
                      <>
                        <span className="ext-divider" />
                        <span className="ext-detail">
                          <span className="ext-detail-icon">⭐</span>
                          {meta.rating.toFixed(1)} rating
                        </span>
                      </>
                    )}
                    {meta?.scanTimestamp && (
                      <>
                        <span className="ext-divider" />
                        <span className="ext-detail ext-detail-muted">
                          <span className="ext-detail-icon">📅</span>
                          Last scanned {new Date(meta.scanTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </>
                    )}
                  </div>
                  {riskLabels.length > 0 && (
                    <div className="extension-risk-pills">
                      {riskLabels.map((r, i) => (
                        <span key={i} className="risk-pill">
                          <span className="risk-pill-icon">{r.icon}</span>
                          {r.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="extension-card-score">
                  <DonutScore
                    score={overallScore}
                    band={overallBand}
                    size={300}
                  />
                </div>
              </div>
            </div>

            {/* Quick Summary + Top 3 findings */}
            <SummaryPanel
              scores={scores}
              factorsByLayer={factorsByLayer}
              rawScanResult={scanResults}
              keyFindings={keyFindings}
              onViewEvidence={openEvidenceDrawer}
              topFindings={topThreeFindings}
              onViewRiskyPermissions={() => openLayerModal('security')}
              onViewNetworkDomains={() => openLayerModal('privacy')}
            />
          </div>

          {/* Right Column: Security/Privacy/Governance cards */}
          <div className="results-v2-right">
            <div className="results-v2-sidebar">
            <ResultsSidebarTile
              title="Security"
              score={scores?.security?.score}
              band={scores?.security?.band || 'NA'}
              findingsCount={securityFindingsCount}
              onClick={() => openLayerModal('security')}
            />
            <ResultsSidebarTile
              title="Privacy"
              score={scores?.privacy?.score ?? null}
              band={scores?.privacy?.band || 'NA'}
              findingsCount={privacyFindingsCount}
              onClick={() => openLayerModal('privacy')}
            />
            <ResultsSidebarTile
              title="Governance"
              score={scores?.governance?.score ?? null}
              band={scores?.governance?.band || 'NA'}
              findingsCount={governanceFindingsCount}
              onClick={() => openLayerModal('governance')}
            />
            </div>
          </div>
        </div>
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

      {/* Layer Modals - pass layerDetails from report_view_model for LLM-generated insights */}
      {layerModal.layer === 'security' && (
        <LayerModal
          open={layerModal.open}
          onClose={closeLayerModal}
          layer="security"
          score={scores?.security?.score}
          band={scores?.security?.band || 'NA'}
          factors={factorsByLayer?.security || []}
          keyFindings={dedupeFindings(allSecurityFindings)}
          gateResults={scanResults?.scoring_v2?.gate_results?.filter(g => g.triggered && gateIdToLayer(g.gate_id) === 'security') || []}
          layerReasons={scores?.reasons?.filter(r => r.toLowerCase().includes('security') || r.toLowerCase().includes('sast') || r.toLowerCase().includes('malware')) || []}
          layerDetails={scanResults?.report_view_model?.layer_details}
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
          keyFindings={dedupeFindings(allPrivacyFindings)}
          gateResults={scanResults?.scoring_v2?.gate_results?.filter(g => g.triggered && gateIdToLayer(g.gate_id) === 'privacy') || []}
          layerReasons={scores?.reasons?.filter(r => r.toLowerCase().includes('privacy') || r.toLowerCase().includes('exfil') || r.toLowerCase().includes('tracking')) || []}
          layerDetails={scanResults?.report_view_model?.layer_details}
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
          layerDetails={scanResults?.report_view_model?.layer_details}
          onViewEvidence={openEvidenceDrawer}
        />
      )}
    </div>
  );
};

export default ScanResultsPageV2;
