import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { RISK_BAND_THRESHOLDS } from '../../constants/riskBands';
import './DonutScore.scss';

/**
 * DonutScore - Accessible risk gauge with red/amber/green zones
 * - Track shows three segments: Red (0–59), Amber (60–84), Green (85–100)
 * - Fill arc uses the band color so the current score is clearly in one zone
 * - Risk pill shows overall status and, when relevant, which layers need attention (Security, Privacy, Governance)
 *
 * Props:
 * - score: number (0-100)
 * - band: "GOOD" | "WARN" | "BAD" | "NA"
 * - size?: number (default: 300)
 * - label?: string (e.g. "OVERALL") – shown above value when provided
 */
const DonutScore = ({ score = 0, band = 'NA', size = 300, label }) => {
  const clampedScore = Math.max(0, Math.min(100, score ?? 0));
  const [animatedScore, setAnimatedScore] = useState(0);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setAnimatedScore(clampedScore);
      return;
    }
    const duration = 1100;
    const startTime = Date.now();
    const startScore = animatedScore;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const newScore = startScore + (clampedScore - startScore) * eased;
      setAnimatedScore(progress < 1 ? newScore : clampedScore);
      if (progress < 1) requestAnimationFrame(animate);
    };
    const id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, [clampedScore, prefersReducedMotion]);

  const center = size / 2;
  const radius = size * 0.38;
  const strokeW = size * 0.055;
  const displayScore = Math.round(animatedScore);
  const circumference = 2 * Math.PI * radius;

  const getStatusLabel = () => {
    switch (band) {
      case 'GOOD': return RISK_BAND_THRESHOLDS.GOOD.label;
      case 'WARN': return RISK_BAND_THRESHOLDS.WARN.label;
      case 'BAD': return RISK_BAND_THRESHOLDS.BAD.label;
      default: return 'N/A';
    }
  };

  const getStatusClass = () => {
    switch (band) {
      case 'GOOD': return 'status-good';
      case 'WARN': return 'status-warn';
      case 'BAD': return 'status-bad';
      default: return 'status-na';
    }
  };

  const getFillColor = () => {
    switch (band) {
      case 'GOOD': return RISK_BAND_THRESHOLDS.GOOD.color;
      case 'WARN': return RISK_BAND_THRESHOLDS.WARN.color;
      case 'BAD': return RISK_BAND_THRESHOLDS.BAD.color;
      default: return 'rgba(255,255,255,0.35)';
    }
  };

  const tickCount = 60;
  const tickLength = size * 0.012;
  const tickRadius = radius + strokeW / 2;

  const fillLength = (animatedScore / 100) * circumference;

  const ariaLabel = `Risk score ${displayScore} out of 100. ${getStatusLabel()}. Scale: 0 to 59 is high risk, 60 to 84 is needs review, 85 to 100 is low risk.`;

  const segmentLength = (min, max) => ((max - min) / 100) * circumference;
  const redLen = segmentLength(0, 59);
  const amberLen = segmentLength(60, 84);
  const greenLen = segmentLength(85, 100);

  return (
    <motion.div
      className={`donut-score donut-score--gauge${size <= 260 ? ' donut-score--compact' : ''}`}
      style={{ width: size, height: size }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut-svg" aria-hidden="true">
        {/* Tick marks */}
        {Array.from({ length: tickCount }, (_, i) => {
          const angle = (i / tickCount) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const x1 = center + (tickRadius - tickLength) * Math.cos(rad);
          const y1 = center + (tickRadius - tickLength) * Math.sin(rad);
          const x2 = center + (tickRadius + tickLength) * Math.cos(rad);
          const y2 = center + (tickRadius + tickLength) * Math.sin(rad);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={1}
              strokeLinecap="round"
            />
          );
        })}
        {/* Background track: three zones (red, amber, green) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={RISK_BAND_THRESHOLDS.BAD.color}
          strokeWidth={strokeW}
          strokeDasharray={`${redLen} ${circumference - redLen}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          className="donut-zone donut-zone-red"
          opacity={0.35}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={RISK_BAND_THRESHOLDS.WARN.color}
          strokeWidth={strokeW}
          strokeDasharray={`${amberLen} ${circumference - amberLen}`}
          strokeDashoffset={-redLen}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          className="donut-zone donut-zone-amber"
          opacity={0.35}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={RISK_BAND_THRESHOLDS.GOOD.color}
          strokeWidth={strokeW}
          strokeDasharray={`${greenLen} ${circumference - greenLen}`}
          strokeDashoffset={-(redLen + amberLen)}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          className="donut-zone donut-zone-green"
          opacity={0.35}
        />
        {/* Filled arc — color by current band */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={getFillColor()}
          strokeWidth={strokeW}
          strokeDasharray={`${fillLength} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          className="donut-fill"
          style={{ transition: prefersReducedMotion ? 'none' : 'stroke-dasharray 1.1s cubic-bezier(0, 0, 0.2, 1)' }}
        />
      </svg>
      <div className="donut-center">
        {label && <div className="donut-label">{label}</div>}
        <div className="donut-value">{displayScore}</div>
        <span className={`donut-status-pill ${getStatusClass()}`}>
          {band === 'GOOD' && (
            <svg className="donut-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {getStatusLabel()}
        </span>
      </div>
    </motion.div>
  );
};

export default DonutScore;
