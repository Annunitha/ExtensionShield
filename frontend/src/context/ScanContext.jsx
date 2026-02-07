import React, { createContext, useContext, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import realScanService from "../services/realScanService";
import databaseService from "../services/databaseService";

const ScanContext = createContext(null);

export const useScan = () => {
  const context = useContext(ScanContext);
  if (!context) {
    throw new Error("useScan must be used within a ScanProvider");
  }
  return context;
};

export const ScanProvider = ({ children }) => {
  const navigate = useNavigate();
  
  // Scan state
  const [url, setUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanStage, setScanStage] = useState(null);
  const [scanResults, setScanResults] = useState(null);
  const [error, setError] = useState(null);
  const [currentExtensionId, setCurrentExtensionId] = useState(null);
  
  // Dashboard stats
  const [dashboardStats, setDashboardStats] = useState({
    totalScans: { value: 0, sparkline: [0] },
    highRisk: { value: 0, sparkline: [0] },
    totalFiles: { value: 0, sparkline: [0] },
    totalVulnerabilities: { value: 0, sparkline: [0] },
  });

  // Scan history
  const [scanHistory, setScanHistory] = useState([]);

  // Load dashboard stats
  const loadDashboardStats = useCallback(async () => {
    try {
      const metrics = await databaseService.getDashboardMetrics();
      setDashboardStats(metrics);
    } catch (err) {
      console.error("Error loading dashboard stats:", err);
    }
  }, []);

  // Load scan history
  const loadScanHistory = useCallback(async () => {
    try {
      const history = await databaseService.getScanHistory(50);
      setScanHistory(history);
      return history;
    } catch (err) {
      console.error("Error loading scan history:", err);
      setScanHistory([]);
      return [];
    }
  }, []);

  // Extract extension ID from URL
  const extractExtensionId = useCallback((url) => {
    return realScanService.extractExtensionId(url);
  }, []);

  // Wait for scan completion with stage progression
  const waitForScanCompletion = useCallback(async (extensionId) => {
    const stages = [
      "extracting",
      "security_scan",
      "building_evidence",
      "applying_rules",
      "generating_report",
    ];

    for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
      setScanStage(stages[stageIndex]);

      const stageDuration = 10 + Math.random() * 5;
      const steps = Math.ceil(stageDuration / 2);

      for (let step = 0; step < steps; step++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const status = await realScanService.checkScanStatus(extensionId);
        if (status.scanned) {
          setScanStage("generating_report");
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return;
        }

        if (status.status === "failed") {
          // Check for API key errors (401) - show user-friendly message
          if (status.error_code === 401 || status.error?.includes("API key") || status.error?.includes("Invalid API key") || status.error?.includes("Authentication") || status.error?.includes("sk-proj")) {
            throw new Error("Connection is down try back in a while");
          }
          // Check for connection refused errors (503) - LLM service issues
          if (status.error_code === 503 || status.error?.includes("Connection refused") || status.error?.includes("Errno 61") || status.error?.includes("LLM service")) {
            throw new Error("LLM service unavailable. Please check your LLM provider configuration.");
          }
          throw new Error(status.error || "Scan failed on the server.");
        }
      }
    }

    const status = await realScanService.checkScanStatus(extensionId);
    if (status.scanned) {
      return;
    }

    throw new Error("Scan timeout - extension analysis took too long");
  }, []);

  // Start scan from URL
  const startScan = useCallback(async (scanUrl) => {
    const urlToScan = scanUrl || url;
    
    if (!urlToScan.trim()) {
      setError("Please enter a Chrome Web Store URL");
      return;
    }

    setIsScanning(true);
    setError(null);
    setScanResults(null);
    setScanStage("extracting");

    try {
      const extId = extractExtensionId(urlToScan);
      if (!extId) {
        throw new Error("Invalid Chrome Web Store URL format");
      }

      setCurrentExtensionId(extId);

      // Daily deep-scan limit check (cached lookups still allowed) - skip in development
      const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
      if (isDevelopment) {
        // In development, skip limit check - backend will also skip it
      } else {
        try {
          const limit = await realScanService.getDeepScanLimitStatus();
          if (limit?.remaining <= 0) {
            const cached = await realScanService.hasCachedResults(extId);
            if (!cached) {
              setError("Daily deep-scan limit reached. Cached lookups are still unlimited.");
              setScanStage(null);
              setIsScanning(false);
              return;
            }
          }
        } catch (e) {
          // If the limit check fails, fall back to backend enforcement.
        }
      }

      // Navigate to the progress/game screen ASAP for best UX.
      // The progress page will poll status until the scan is running/completed.
      navigate(`/scan/progress/${extId}`);
      
      // Check status and trigger scan in the background
      const status = await realScanService.checkScanStatus(extId);
      let scanTrigger = null;

      if (!status.scanned) {
        scanTrigger = await realScanService.triggerScan(urlToScan);

        // For cached lookups, backend may return status=completed + already_scanned=true
        if (!scanTrigger.already_scanned && scanTrigger.status !== "running") {
          throw new Error(scanTrigger.error || "Failed to start scan");
        }
      }
      
      if (!status.scanned && scanTrigger && !scanTrigger.already_scanned) {
        await waitForScanCompletion(extId);
      }

      // Fetch results (may take a moment after status flips to scanned)
      const maxAttempts = 10;
      let results = null;
      for (let i = 0; i < maxAttempts; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        results = await realScanService.getRealScanResults(extId);
        if (results) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      setScanResults(results);
      setError("");
      setScanStage(null);
      setIsScanning(false);

      // Refresh stats and history (best-effort)
      await loadScanHistory();
      await loadDashboardStats();

      // IMPORTANT: Do not auto-navigate to results.
      // The progress page will show a "Scan complete" prompt allowing users
      // to keep playing or view results.
    } catch (err) {
      // Check for API key errors (401) - show user-friendly message
      let errorMessage = err.message || "Failed to scan extension.";
      if (err.message?.includes("API key") || err.message?.includes("Invalid API key") || err.message?.includes("Authentication") || err.message?.includes("401")) {
        errorMessage = "Connection is down try back in a while";
      } else if (err.message?.includes("Connection refused") || err.message?.includes("Errno 61") || err.message?.includes("LLM service")) {
        errorMessage = "LLM service unavailable. Please check your LLM provider configuration (LLM_FALLBACK_CHAIN).";
      }
      setError(errorMessage);
      setScanStage(null);
      setIsScanning(false);
      // Stay on progress page to show error
    }
  }, [url, extractExtensionId, navigate, waitForScanCompletion, loadScanHistory, loadDashboardStats]);

  // Handle file upload
  const handleFileUpload = useCallback(async (file) => {
    setIsScanning(true);
    setError(null);
    setScanResults(null);
    setScanStage("extracting");

    try {
      // Daily deep-scan limit check (uploads are always deep scans) - skip in development
      const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
      if (!isDevelopment) {
        try {
          const limit = await realScanService.getDeepScanLimitStatus();
          if (limit?.remaining <= 0) {
            setError("Daily deep-scan limit reached. Cached lookups are still unlimited.");
            setScanStage(null);
            setIsScanning(false);
            return;
          }
        } catch (e) {
          // If the limit check fails, fall back to backend enforcement.
        }
      }

      const uploadResult = await realScanService.uploadAndScan(file);

      if (!uploadResult || !uploadResult.extension_id) {
        throw new Error("Failed to upload file");
      }

      const extensionId = uploadResult.extension_id;
      setCurrentExtensionId(extensionId);
      
      // Navigate to progress page
      navigate(`/scan/progress/${extensionId}`);

      await waitForScanCompletion(extensionId);

      const maxAttempts = 10;
      let results = null;
      for (let i = 0; i < maxAttempts; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        results = await realScanService.getRealScanResults(extensionId);
        if (results) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      setScanResults(results);
      setError("");
      setScanStage(null);
      setIsScanning(false);

      await loadScanHistory();
      await loadDashboardStats();
      // Do not auto-navigate; progress page will prompt.
    } catch (err) {
      setError(err.message || "Failed to upload and scan file.");
      setScanStage(null);
      setIsScanning(false);
    }
  }, [navigate, waitForScanCompletion, loadScanHistory, loadDashboardStats]);

  // Load scan from history
  const loadScanFromHistory = useCallback(async (extId) => {
    try {
      let results = await databaseService.getScanResult(extId);

      if (!results) {
        results = await realScanService.getRealScanResults(extId);
      }

      if (results && !results.files) {
        results = realScanService.formatRealResults(results);
      }

      setScanResults(results);
      setCurrentExtensionId(extId);
      setError("");
      
      // Navigate to results page
      navigate(`/scan/results/${extId}`);
    } catch (err) {
      console.error(err);
      setError("Failed to load scan results from history.");
    }
  }, [navigate]);

  // Load results for a specific extension ID (for direct URL access)
  const loadResultsById = useCallback(async (extId) => {
    try {
      let results = await databaseService.getScanResult(extId);

      if (!results) {
        results = await realScanService.getRealScanResults(extId);
      }

      if (results && !results.files) {
        results = realScanService.formatRealResults(results);
      }

      setScanResults(results);
      setCurrentExtensionId(extId);
      setError("");
      return results;
    } catch (err) {
      console.error(err);
      setError("Failed to load scan results.");
      return null;
    }
  }, []);

  // Clear scan state
  const clearScan = useCallback(() => {
    setUrl("");
    setIsScanning(false);
    setScanStage(null);
    setScanResults(null);
    setError(null);
    setCurrentExtensionId(null);
  }, []);

  const value = {
    // State
    url,
    setUrl,
    isScanning,
    scanStage,
    scanResults,
    setScanResults,
    error,
    setError,
    currentExtensionId,
    dashboardStats,
    scanHistory,
    
    // Actions
    startScan,
    handleFileUpload,
    loadScanFromHistory,
    loadResultsById,
    loadDashboardStats,
    loadScanHistory,
    extractExtensionId,
    clearScan,
  };

  return (
    <ScanContext.Provider value={value}>
      {children}
    </ScanContext.Provider>
  );
};

export default ScanContext;

