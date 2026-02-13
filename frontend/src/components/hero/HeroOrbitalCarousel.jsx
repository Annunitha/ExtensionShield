import React, { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import databaseService from "../../services/databaseService";
import extensionCacheService from "../../services/extensionCacheService";
import { enrichScans } from "../../utils/scanEnrichment";
import { getExtensionIconUrl, EXTENSION_ICON_PLACEHOLDER } from "../../utils/constants";
import "./HeroOrbitalCarousel.scss";

const VIEWPORT_COMPACT = 1024;

// Primary ring: main interactive layer
const PRIMARY_RADIUS = 170;
const PRIMARY_DURATION = 45; // seconds, clockwise
const PRIMARY_ICON_COUNT = 7;

// Secondary ring: depth only, subtle
const SECONDARY_RADIUS = 240;
const SECONDARY_DURATION = 65; // seconds, counter-clockwise
const SECONDARY_ICON_COUNT = 5;

// Orbit is circular in 3D (rotateY only); rotateX tilt projects it as an ellipse on screen.
const ORBIT_TILT = 17; // rotateX 16–18deg
const MAX_SCANS = PRIMARY_ICON_COUNT + SECONDARY_ICON_COUNT;

// Placeholder scan data for empty state
const PLACEHOLDER_SCANS = [
  { extensionId: "session-buddy", name: "Session Buddy", security: { level: "ok", label: "No critical issues", score: 95 }, privacy: { level: "warn", label: "Trackers detected", score: 72 }, governance: { level: "ok", label: "Standard permissions", score: 94 }, lastAnalyzed: "1m ago" },
  { extensionId: "hover-zoom", name: "Hover Zoom+", security: { level: "ok", label: "Good", score: 93 }, privacy: { level: "ok", label: "No trackers", score: 91 }, governance: { level: "ok", label: "Standard permissions", score: 96 }, lastAnalyzed: "2m ago" },
  { extensionId: "stylus", name: "Stylus", security: { level: "ok", label: "No critical issues", score: 90 }, privacy: { level: "warn", label: "Third-party scripts", score: 70 }, governance: { level: "ok", label: "Standard permissions", score: 95 }, lastAnalyzed: "5m ago" },
  { extensionId: "adblock", name: "Adblock Plus", security: { level: "ok", label: "No critical issues", score: 97 }, privacy: { level: "ok", label: "Minimal data", score: 95 }, governance: { level: "ok", label: "Standard permissions", score: 97 }, lastAnalyzed: "8m ago" },
  { extensionId: "honey", name: "PayPal Honey", security: { level: "warn", label: "Review recommended", score: 72 }, privacy: { level: "warn", label: "Trackers detected", score: 58 }, governance: { level: "ok", label: "Standard permissions", score: 90 }, lastAnalyzed: "12m ago" },
  { extensionId: "grammarly", name: "Grammarly", security: { level: "ok", label: "No critical issues", score: 96 }, privacy: { level: "warn", label: "Data collection", score: 65 }, governance: { level: "ok", label: "Standard permissions", score: 94 }, lastAnalyzed: "15m ago" },
  { extensionId: "hola", name: "Hola VPN", security: { level: "warn", label: "Review recommended", score: 55 }, privacy: { level: "warn", label: "Trackers detected", score: 48 }, governance: { level: "warn", label: "Broad permissions", score: 60 }, lastAnalyzed: "20m ago" },
  { extensionId: "vdh", name: "Video DownloadHelper", security: { level: "ok", label: "No critical issues", score: 94 }, privacy: { level: "ok", label: "No trackers", score: 92 }, governance: { level: "ok", label: "Standard permissions", score: 95 }, lastAnalyzed: "25m ago" },
  { extensionId: "ublock", name: "uBlock Origin", security: { level: "ok", label: "No critical issues", score: 98 }, privacy: { level: "ok", label: "Minimal data", score: 96 }, governance: { level: "ok", label: "Standard permissions", score: 98 }, lastAnalyzed: "30m ago" },
  { extensionId: "lastpass", name: "LastPass", security: { level: "warn", label: "Review recommended", score: 78 }, privacy: { level: "warn", label: "Data collection", score: 62 }, governance: { level: "ok", label: "Standard permissions", score: 88 }, lastAnalyzed: "35m ago" },
  { extensionId: "react-devtools", name: "React DevTools", security: { level: "ok", label: "No critical issues", score: 92 }, privacy: { level: "ok", label: "No trackers", score: 95 }, governance: { level: "ok", label: "Standard permissions", score: 94 }, lastAnalyzed: "40m ago" },
  { extensionId: "json-viewer", name: "JSON Viewer", security: { level: "ok", label: "No critical issues", score: 91 }, privacy: { level: "ok", label: "No trackers", score: 93 }, governance: { level: "ok", label: "Standard permissions", score: 92 }, lastAnalyzed: "45m ago" },
];

function mapSignal(signal, fallbackLabel = "—") {
  if (!signal) return { level: "ok", label: fallbackLabel, score: 0 };
  return {
    level: signal.level || "ok",
    label: signal.label || fallbackLabel,
    score: Number.isFinite(signal.score) ? Math.max(0, Math.min(100, signal.score)) : 0,
  };
}

function simplifyScan(scan) {
  const security = mapSignal(scan?.signals?.security_signal, "Security");
  const privacy = mapSignal(scan?.signals?.privacy_signal, "Privacy");
  const governance = mapSignal(scan?.signals?.governance_signal, "Governance");

  return {
    extensionId: scan?.extension_id || scan?.id || scan?.extensionId,
    name: scan?.name || scan?.extension_name || scan?.metadata?.name || "Extension",
    security,
    privacy,
    governance,
    lastAnalyzed: scan?.last_scanned_at
      ? new Date(scan.last_scanned_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "Recently",
  };
}

function getOverallStatus(scan) {
  if (scan?.security?.level === "high" || scan?.privacy?.level === "high" || scan?.governance?.level === "high") return "danger";
  if (scan?.security?.level === "warn" || scan?.privacy?.level === "warn" || scan?.governance?.level === "warn") return "warning";
  return "safe";
}

function FocusCard({ scan, isVisible }) {
  const iconUrl = scan?.extensionId ? extensionCacheService.getIconUrl(scan.extensionId) : EXTENSION_ICON_PLACEHOLDER;
  const detailsHref = scan?.extensionId ? `/scan/results/${encodeURIComponent(scan.extensionId)}` : null;

  return (
    <motion.div
      className="hero-orbital-focus-card"
      role="article"
      aria-label={`Scan report: ${scan?.name}`}
      initial={{ opacity: 0, scale: 0.35 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
    >
      <div className="hero-orbital-focus-icon-wrap">
        <div className="hero-orbital-focus-icon">
          <img src={iconUrl} alt="" onError={(e) => { e.target.onerror = null; e.target.src = EXTENSION_ICON_PLACEHOLDER; }} />
        </div>
        <div className="hero-orbital-focus-title-row">
          <p className="hero-orbital-focus-label">{scan?.name || "Extension"}</p>
          {detailsHref && (
            <Link to={detailsHref} className="hero-orbital-focus-details-link" aria-label={`View details: ${scan?.name || "Extension"}`} title="View details">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <path d="M15 3h6v6" />
                <path d="M10 14L21 3" />
              </svg>
            </Link>
          )}
        </div>
      </div>
      <div className="hero-orbital-focus-rows">
        <div className="hero-orbital-focus-row security">
          <div className="hero-orbital-focus-row-header">
            <svg className={`hero-orbital-focus-row-icon ${scan?.security?.level === "ok" ? "safe" : scan?.security?.level === "high" ? "danger" : "warning"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {scan?.security?.level === "ok" ? <path d="M20 6L9 17l-5-5" /> : <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>}
            </svg>
            <div>
              <strong>Security</strong>
              <span>{scan?.security?.label ?? "—"}</span>
            </div>
          </div>
          <div className="hero-orbital-progress-bar">
            <motion.div className={`hero-orbital-progress-fill ${scan?.security?.level === "ok" ? "safe" : scan?.security?.level === "high" ? "danger" : "warning"}`} initial={{ width: 0 }} animate={isVisible ? { width: `${scan?.security?.score ?? 0}%` } : {}} transition={{ duration: 0.6, ease: "easeOut" }} />
          </div>
        </div>
        <div className="hero-orbital-focus-row privacy">
          <div className="hero-orbital-focus-row-header">
            <svg className={`hero-orbital-focus-row-icon ${scan?.privacy?.level === "ok" ? "safe" : scan?.privacy?.level === "high" ? "danger" : "warning"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {scan?.privacy?.level === "ok" ? <path d="M20 6L9 17l-5-5" /> : <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>}
            </svg>
            <div>
              <strong>Privacy</strong>
              <span>{scan?.privacy?.label ?? "—"}</span>
            </div>
          </div>
          <div className="hero-orbital-progress-bar">
            <motion.div className={`hero-orbital-progress-fill ${scan?.privacy?.level === "ok" ? "safe" : scan?.privacy?.level === "high" ? "danger" : "warning"}`} initial={{ width: 0 }} animate={isVisible ? { width: `${scan?.privacy?.score ?? 0}%` } : {}} transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }} />
          </div>
        </div>
        <div className="hero-orbital-focus-row governance">
          <div className="hero-orbital-focus-row-header">
            <svg className={`hero-orbital-focus-row-icon ${scan?.governance?.level === "ok" ? "safe" : scan?.governance?.level === "high" ? "danger" : "warning"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {scan?.governance?.level === "ok" ? <path d="M20 6L9 17l-5-5" /> : <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>}
            </svg>
            <div>
              <strong>Governance</strong>
              <span>{scan?.governance?.label ?? "—"}</span>
            </div>
          </div>
          <div className="hero-orbital-progress-bar">
            <motion.div className={`hero-orbital-progress-fill ${scan?.governance?.level === "ok" ? "safe" : scan?.governance?.level === "high" ? "danger" : "warning"}`} initial={{ width: 0 }} animate={isVisible ? { width: `${scan?.governance?.score ?? 0}%` } : {}} transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }} />
          </div>
        </div>
      </div>
      <p className="hero-orbital-focus-meta">Last analyzed {scan?.lastAnalyzed ?? "—"}</p>
    </motion.div>
  );
}

/**
 * Depth: Front 1/1, Mid 0.92/0.6, Back 0.82/0.28. Slight shadow variation.
 * Optional maxOpacity for secondary ring (e.g. 0.6).
 */
function computeDepth(ringAngleDeg, index, cardCount, tiltDeg, maxOpacity = 1) {
  const degPerCard = cardCount > 0 ? 360 / cardCount : 360;
  const worldAngle = ((ringAngleDeg + index * degPerCard) % 360 + 360) % 360;
  const toFront = Math.min(worldAngle, 360 - worldAngle);
  const normalized = toFront / 180; // 0 = front, 1 = back
  const scale = 0.82 + 0.18 * (1 - normalized);
  let opacity = 0.28 + 0.72 * (1 - normalized);
  if (maxOpacity < 1) opacity = Math.min(maxOpacity, opacity);
  const zIndex = Math.round(100 + 50 * (1 - normalized));
  const offsetY = 1 + normalized * 0.8;
  const shadowDepth = normalized * 2;
  const counterRotateY = ringAngleDeg + index * degPerCard;
  const counterRotateX = tiltDeg;
  return { scale, opacity, zIndex, offsetY, shadowDepth, counterRotateY, counterRotateX };
}

function OrbitIcon({ scan, depth, isSelected, isHovered, interactive = true, compact = false, onClick, onHoverStart, onHoverEnd }) {
  const extensionId = scan?.extensionId || scan?.extension_id;
  const iconUrl = extensionId ? extensionCacheService.getIconUrl(extensionId) : EXTENSION_ICON_PLACEHOLDER;
  const scale = depth?.scale ?? 1;
  const opacity = depth?.opacity ?? 1;
  const zIndex = depth?.zIndex ?? 1;
  const counterRotateY = depth?.counterRotateY ?? 0;
  const counterRotateX = depth?.counterRotateX ?? 0;
  const offsetY = depth?.offsetY ?? 0;
  const shadowDepth = depth?.shadowDepth ?? 0;
  const status = getOverallStatus(scan);
  const statusLabel = status === "safe" ? "Safe" : status === "warning" ? "Review" : "Risk";

  const style = compact
    ? undefined
    : {
        transformStyle: "preserve-3d",
        transform: `rotateX(${-counterRotateX}deg) rotateY(${-counterRotateY}deg) translateY(${offsetY}px)`,
        scale,
        opacity,
        zIndex,
        pointerEvents: interactive && opacity >= 0.4 ? "auto" : "none",
        "--orbit-shadow-depth": shadowDepth,
      };

  const content = (
    <>
      <div className={`hero-orbit-icon__ring ${isSelected ? "hero-orbit-icon__ring--active" : ""}`}>
        <img src={iconUrl} alt="" onError={(e) => { e.target.onerror = null; e.target.src = EXTENSION_ICON_PLACEHOLDER; }} />
      </div>
      {interactive && isHovered && opacity >= 0.6 && (
        <div className="hero-orbit-icon__tooltip">
          <span className="tooltip-name">{scan?.name || "Extension"}</span>
          <span className={`tooltip-status tooltip-status--${status}`}>{statusLabel}</span>
          <span className="tooltip-cta">Click to view report</span>
        </div>
      )}
    </>
  );

  if (interactive) {
    return (
      <motion.button
        type="button"
        className={`hero-orbit-icon ${isSelected ? "hero-orbit-icon--selected" : ""} ${compact ? "hero-orbit-icon--compact" : ""}`}
        onClick={onClick}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        aria-label={`View scan: ${scan?.name}`}
        style={style}
        whileHover={opacity >= 0.5 ? { scale: scale * 1.08 } : {}}
        whileTap={opacity >= 0.5 ? { scale: scale * 0.98 } : {}}
      >
        {content}
      </motion.button>
    );
  }

  return (
    <div
      className={`hero-orbit-icon hero-orbit-icon--secondary ${compact ? "hero-orbit-icon--compact" : ""}`}
      style={style}
      aria-hidden="true"
    >
      {content}
    </div>
  );
}

function PrimaryOrbit({ scans, angle, reducedMotion, focusedIndex, hoveredIndex, onSelect, onHover, tilt }) {
  const count = scans.length;
  const degPerCard = count > 0 ? 360 / count : 360;

  return (
    <div
      className="hero-orbital-ring hero-orbital-ring--primary"
      style={{
        transformStyle: "preserve-3d",
        transform: reducedMotion ? "rotateY(0deg)" : `rotateY(${angle}deg)`,
      }}
    >
      {scans.map((scan, i) => {
        const depth = computeDepth(reducedMotion ? 0 : angle, i, count, tilt, 1);
        return (
          <div
            key={(scan?.extensionId || scan?.name) + "p" + i}
            className="hero-orbital-slot"
            style={{
              transform: `rotateY(${i * degPerCard}deg) translateZ(${PRIMARY_RADIUS}px)`,
              transformStyle: "preserve-3d",
            }}
          >
            <OrbitIcon
              scan={scan}
              depth={depth}
              isSelected={focusedIndex === i}
              isHovered={hoveredIndex === i}
              interactive
              onClick={() => onSelect(i)}
              onHoverStart={() => onHover(i)}
              onHoverEnd={() => onHover(null)}
            />
          </div>
        );
      })}
    </div>
  );
}

function SecondaryOrbit({ scans, angle, reducedMotion, tilt }) {
  const count = scans.length;
  const degPerCard = count > 0 ? 360 / count : 360;

  return (
    <div
      className="hero-orbital-ring hero-orbital-ring--secondary"
      style={{
        transformStyle: "preserve-3d",
        transform: reducedMotion ? "rotateY(0deg)" : `rotateY(${angle}deg)`,
      }}
    >
      {scans.map((scan, i) => {
        const depth = computeDepth(reducedMotion ? 0 : angle, i, count, tilt, 0.6);
        return (
          <div
            key={(scan?.extensionId || scan?.name) + "s" + i}
            className="hero-orbital-slot"
            style={{
              transform: `rotateY(${i * degPerCard}deg) translateZ(${SECONDARY_RADIUS}px)`,
              transformStyle: "preserve-3d",
            }}
          >
            <OrbitIcon scan={scan} depth={depth} isSelected={false} isPaused={false} interactive={false} />
          </div>
        );
      })}
    </div>
  );
}

function ReportCardModal({ open, onClose, focusScan, isVisible }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="hero-orbital-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Extension scan report"
        >
          <motion.div
            className="hero-orbital-modal-content"
            initial={{ opacity: 0, scale: 0.35 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="hero-orbital-modal-close" onClick={onClose} aria-label="Close report">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
            <FocusCard scan={focusScan} isVisible={isVisible} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function HeroOrbitalCarousel() {
  const [primaryAngle, setPrimaryAngle] = useState(0);
  const [secondaryAngle, setSecondaryAngle] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null); // per-icon hover
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [cardRevealed, setCardRevealed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [scans, setScans] = useState(PLACEHOLDER_SCANS);
  const [iconCacheVersion, setIconCacheVersion] = useState(0);
  const [compact, setCompact] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);

  useEffect(() => {
    setIsVisible(true);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Check cache first for instant load
    const cached = extensionCacheService.get();
    if (cached && cached.length > 0) {
      setScans(cached);
      setFocusedIndex(0);
    }

    // Fetch fresh data in background
    (async () => {
      try {
        const recent = await databaseService.getRecentScans(MAX_SCANS);
        if (cancelled || !recent || recent.length === 0) return;
        const enriched = await enrichScans(recent);
        const simplified = enriched.map(simplifyScan).filter((s) => s.extensionId).slice(0, MAX_SCANS);
        if (!cancelled && simplified.length > 0) {
          // Update cache and re-render when icons are stored so they display
          extensionCacheService.set(simplified, () => setIconCacheVersion((v) => v + 1));
          setScans(simplified);
          if (!cached || cached.length === 0) {
            setFocusedIndex(0);
          }
        }
      } catch {
        // fallback to placeholders if no cache
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const tick = (time) => {
      lastTimeRef.current ??= time;
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      if (!isPaused) {
        setPrimaryAngle((prev) => (prev + (360 / PRIMARY_DURATION) * delta) % 360);
        setSecondaryAngle((prev) => (prev - (360 / SECONDARY_DURATION) * delta + 360) % 360);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPaused, reducedMotion]);

  const scansToShow = useMemo(() => {
    const arr = scans.length > 0 ? scans : PLACEHOLDER_SCANS;
    return arr.slice(0, MAX_SCANS);
  }, [scans]);

  const primaryScans = useMemo(() => scansToShow.slice(0, PRIMARY_ICON_COUNT), [scansToShow]);
  const secondaryScans = useMemo(() => scansToShow.slice(PRIMARY_ICON_COUNT, PRIMARY_ICON_COUNT + SECONDARY_ICON_COUNT), [scansToShow]);

  useEffect(() => {
    if (focusedIndex >= primaryScans.length) setFocusedIndex(0);
  }, [focusedIndex, primaryScans.length]);

  const focusScan = primaryScans[focusedIndex % primaryScans.length] || primaryScans[0];

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${VIEWPORT_COMPACT}px)`);
    const update = () => setCompact(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const handleSelect = (index) => {
    setFocusedIndex(index);
    setCardRevealed(true);
  };

  const handleHover = (index) => {
    setHoveredIndex(index);
    setIsPaused(index !== null);
  };

  const closeModal = () => setCardRevealed(false);

  if (compact) {
    return (
      <>
        <div className="hero-orbital-carousel hero-orbital-carousel--minimal" role="region" aria-label="Sample scan reports">
          {!cardRevealed && <span className="hero-orbital-minimal-hint">Tap an extension</span>}
          <div className="hero-orbital-mini-strip">
            {primaryScans.map((scan, i) => (
              <OrbitIcon
                key={(scan?.extensionId || scan?.name) + i}
                scan={scan}
                depth={null}
                compact
                isSelected={focusedIndex === i && cardRevealed}
                isHovered={false}
                interactive
                onClick={() => handleSelect(i)}
              />
            ))}
          </div>
        </div>
        <ReportCardModal open={cardRevealed} onClose={closeModal} focusScan={focusScan} isVisible={isVisible} />
      </>
    );
  }

  return (
    <>
      <div
        className={`hero-orbital-carousel hero-orbital-carousel--atomic ${reducedMotion ? "hero-orbital-carousel--static" : ""}`}
        onMouseLeave={() => { setIsPaused(false); setHoveredIndex(null); }}
        role="region"
        aria-label="Sample scan reports carousel"
      >
        <div className="hero-orbital-scene" style={{ perspective: "1200px" }}>
          <div className="hero-orbital-spotlight" aria-hidden="true" />
          <div className="hero-orbital-sun" aria-hidden="true">
            <div className="hero-orbital-sun__core" />
            <div className="hero-orbital-sun__glow" />
          </div>

          <div
            className="hero-orbital-group"
            style={{
              transformStyle: "preserve-3d",
              transform: `rotateX(${ORBIT_TILT}deg)`,
            }}
          >
            <div className="hero-orbital-path hero-orbital-path--primary" aria-hidden="true" />
            <div className="hero-orbital-path hero-orbital-path--secondary" aria-hidden="true" />

            <SecondaryOrbit scans={secondaryScans} angle={secondaryAngle} reducedMotion={reducedMotion} tilt={ORBIT_TILT} />
            <PrimaryOrbit
              scans={primaryScans}
              angle={primaryAngle}
              reducedMotion={reducedMotion}
              focusedIndex={cardRevealed ? focusedIndex : -1}
              hoveredIndex={hoveredIndex}
              onSelect={handleSelect}
              onHover={handleHover}
              tilt={ORBIT_TILT}
            />
          </div>
        </div>

        {!cardRevealed && (
          <motion.div
            className="hero-orbital-cta"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            aria-hidden="true"
          >
            <span className="hero-orbital-cta__dot" />
            <span className="hero-orbital-cta__label">Click an extension</span>
          </motion.div>
        )}
      </div>
      <ReportCardModal open={cardRevealed} onClose={closeModal} focusScan={focusScan} isVisible={isVisible} />
    </>
  );
}
