import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useScan } from "../context/ScanContext";
import { useAuth } from "../context/AuthContext";
import databaseService from "../services/databaseService";
import SEOHead from "../components/SEOHead";
import { HeroOrbitalCarousel } from "../components/hero";
import "./HomePage.scss";

// Real extension listings (Chrome Web Store style)
const EXTENSION_CARDS = [
  { id: "session-buddy", name: "Session Buddy – Tab & Bookmark Manager", stars: "★★★★★", rating: "4.7", users: "1,000,000 users", badge: "Featured", iconClass: "tabs", logoUrl: "https://logo.clearbit.com/sessionbuddy.com", iconSvg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg> },
  { id: "hover-zoom", name: "Hover Zoom+", stars: "★★★★★", rating: "4.0", users: "300,000 users", badge: "Featured", iconClass: "zoom", logoUrl: null, iconSvg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg> },
  { id: "stylus", name: "Stylus", stars: "★★★★★", rating: "4.5", users: "900,000 users", badge: "Featured", iconClass: "stylus", logoUrl: "https://logo.clearbit.com/github.com", iconSvg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /></svg> },
  { id: "adblock", name: "Adblock Plus – free ad blocker", stars: "★★★★★", rating: "4.4", users: "41,000,000 users", badge: "Featured", iconClass: "shield", logoUrl: "https://logo.clearbit.com/adblockplus.org", iconSvg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> },
  { id: "honey", name: "PayPal Honey: Automated Coupons & Cash Back", stars: "★★★★★", rating: "4.6", users: "14,000,000 users", badge: "Featured", iconClass: "honey", logoUrl: "https://logo.clearbit.com/joinhoney.com", iconSvg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L20 7v10l-8 5-8-5V7l8-5z" /><path d="M12 8v8M10 11h4" /></svg> },
  { id: "grammarly", name: "Grammarly: AI Writing Assistant and Grammar Checker App", stars: "★★★★★", rating: "4.5", users: "43,000,000 users", badge: "Featured", iconClass: "grammarly", logoUrl: "https://logo.clearbit.com/grammarly.com", iconSvg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M10 9h4M10 13h4M10 17h2" /></svg> },
  { id: "hola", name: "Hola VPN – Your Website Unblocker", stars: "★★★★★", rating: "4.8", users: "5,000,000 users", badge: "Store listing", iconClass: "vpn", logoUrl: "https://logo.clearbit.com/hola.org", iconSvg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg> },
  { id: "vdh", name: "Video DownloadHelper", stars: "★★★★★", rating: "4.4", users: "5,000,000 users", badge: "Featured", iconClass: "download", logoUrl: "https://logo.clearbit.com/videodownloadhelper.net", iconSvg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="5 3 19 12 5 21 5 3" /><line x1="19" y1="5" x2="19" y2="19" /></svg> },
];

const HomePage = () => {
  const navigate = useNavigate();
  const { startScan, setUrl, error: scanError } = useScan();
  const { isAuthenticated, openSignInModal } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [revealedSections, setRevealedSections] = useState({});
  const [extensionSlideIndex, setExtensionSlideIndex] = useState(0);
  const [extensionsScannedCount, setExtensionsScannedCount] = useState(0);
  const [displayCount, setDisplayCount] = useState(0);
  const displayCountRef = useRef(0);
  const rafRef = useRef(null);

  // Animate display count from current to target (incremental counter effect)
  useEffect(() => {
    const target = Math.max(0, extensionsScannedCount);
    const start = displayCountRef.current;
    const diff = target - start;
    if (diff === 0) return;

    const durationMs = 1400;
    const easeOutQuart = (t) => 1 - (1 - t) ** 4;
    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = easeOutQuart(progress);
      const current = Math.round(start + diff * eased);
      displayCountRef.current = current;
      setDisplayCount(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        displayCountRef.current = target;
        setDisplayCount(target);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [extensionsScannedCount]);

  // Fetch total scanned extensions count from database (stats.total_scans); fallback to recent list length when stats return 0
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stats = await databaseService.getStatistics();
        const count = Math.max(0, Number(stats?.total_scans) || 0);
        if (!cancelled) setExtensionsScannedCount(count);
        if (count === 0) {
          const recent = await databaseService.getRecentScans(100);
          if (!cancelled && Array.isArray(recent) && recent.length > 0) {
            setExtensionsScannedCount(recent.length);
          }
        }
      } catch {
        if (!cancelled) {
          try {
            const recent = await databaseService.getRecentScans(100);
            if (Array.isArray(recent) && recent.length > 0) {
              setExtensionsScannedCount(recent.length);
            } else {
              setExtensionsScannedCount(0);
            }
          } catch {
            setExtensionsScannedCount(0);
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Scroll reveal observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealedSections((prev) => ({
              ...prev,
              [entry.target.id]: true,
            }));
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -50px 0px" }
    );

    const sections = document.querySelectorAll(".reveal-section");
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  const scrollToProof = () => {
    document.getElementById("proof")?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleScan = () => {
    const input = scanInput.trim();
    if (input) {
      // Require auth in production, or in dev when VITE_REQUIRE_AUTH_FOR_SCAN=true
      const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
      const requireAuthForScan = import.meta.env.VITE_REQUIRE_AUTH_FOR_SCAN === 'true';
      if ((!isDevelopment || requireAuthForScan) && !isAuthenticated) {
        // Store the URL so we can resume after login
        sessionStorage.setItem("auth:pendingScanUrl", input);
        sessionStorage.setItem("auth:returnTo", "/scan");
        openSignInModal();
        return;
      }
      // Clear context URL so /scan page starts clean, then trigger scan directly.
      // startScan navigates to /scan/progress/:id → user clicks "View Results" → /scan/results/:id
      setScanInput("");
      setUrl("");
      startScan(input);
    } else {
      navigate('/scan');
    }
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "ExtensionShield",
    "url": "https://extensionshield.com",
    "logo": "https://extensionshield.com/logo.png",
    "description": "Chrome extension scanner — safety reports in seconds.",
    "sameAs": [
      "https://github.com/Stanzin7/ExtensionShield"
    ]
  };

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "ExtensionShield",
    "applicationCategory": "SecurityApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "description": "Chrome extension scanner. Paste a Web Store URL or extension ID and get a safety report in seconds — malware, privacy, and compliance.",
    "url": "https://extensionshield.com/scan"
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "How does Chrome extension security scanning work?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "ExtensionShield analyzes Chrome extensions using static code analysis (SAST), permission analysis, and threat intelligence to generate a comprehensive risk score. We check for malware, privacy risks, and compliance issues."
        }
      },
      {
        "@type": "Question",
        "name": "What is an extension risk score?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "The extension risk score is a numerical rating (0-100) that indicates the overall security risk of a Chrome extension. It's calculated based on code analysis, permission requests, and threat intelligence signals."
        }
      },
      {
        "@type": "Question",
        "name": "Can I scan extensions before installing them?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes! ExtensionShield allows you to scan any Chrome extension from the Chrome Web Store before installing it. Simply paste the extension URL or Chrome Web Store ID to get an instant security analysis."
        }
      },
      {
        "@type": "Question",
        "name": "What permissions should I be concerned about?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Be cautious of extensions requesting broad permissions like 'Read and change all your data on all websites', 'Access your browsing history', or 'Manage your downloads'. Learn more about extension permissions in our glossary."
        }
      },
      {
        "@type": "Question",
        "name": "How accurate is the extension security scanner?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "ExtensionShield uses multiple security analysis techniques including static code analysis, permission analysis, and threat intelligence from VirusTotal. Our methodology is transparent and documented in our research section."
        }
      }
    ]
  };

  return (
    <>
      <SEOHead
        title="Chrome Extension Scanner"
        description="Paste a Chrome Web Store URL or extension ID and get a safety report in seconds. Free Chrome extension scanner for malware, privacy, and compliance."
        pathname="/"
        ogType="website"
        schema={[organizationSchema, softwareAppSchema, faqSchema]}
      />
      
      <div className="home-page">
        {/* Hero Section - Two-column layout with frosted glass scan preview */}
        <section
          className="hero-section"
          aria-label="Chrome Extension Scanner"
        >
          {/* Background Effects - cosmic star texture */}
          <div className="hero-bg">
            <div className="bg-gradient" />
            <div className="bg-grid" />
            <div className="bg-stars" aria-hidden="true" />
            <div className="bg-glow glow-1" />
            <div className="bg-glow glow-2" />
          </div>

          {/* Mobile/tablet: scanner not supported — show idea + "Check on desktop" */}
          <div className="hero-mobile-message">
            <p className="hero-tagline">Chrome Extension Scanner</p>
            <h1 className="hero-title">Know what your Chrome extensions can access.</h1>
            <p className="hero-mobile-cta">Check on desktop.</p>
          </div>

          <div className="hero-desktop-content">
          <div className="hero-grid">
            {/* Left Panel - Headline, Input, CTA */}
            <motion.div
              className="hero-left"
              initial={{ opacity: 0, y: 24 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="hero-tagline">Chrome Extension Scanner</p>
              <h1 className="hero-title">
                Know what your Chrome extensions can access.
              </h1>
              <p className="hero-subtitle">
                Paste a Chrome Web Store URL — get a safety report in under 60 seconds.
              </p>

              <div className="hero-search">
                <div className="search-container">
                  <span className="search-icon search-icon-chrome" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="chrome-logo">
                      <path d="M12 12L22 12A10 10 0 0 1 7 3.34L12 12Z" fill="#4285F4" />
                      <path d="M12 12L7 3.34A10 10 0 0 1 7 20.66L12 12Z" fill="#EA4335" />
                      <path d="M12 12L7 20.66A10 10 0 0 1 22 12L12 12Z" fill="#FBBC05" />
                      <circle cx="12" cy="12" r="4" fill="#34A853" />
                      <circle cx="12" cy="12" r="2.5" fill="white" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    id="hero-scan-input"
                    placeholder="Paste Chrome Web Store URL or Extension ID"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleScan()}
                    aria-label="Chrome Web Store URL or Extension ID"
                    autoComplete="url"
                  />
                  <motion.button
                    type="button"
                    className="search-btn search-btn-icon"
                    onClick={handleScan}
                    aria-label="Scan extension"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                  </motion.button>
                </div>
                <p className="hero-scan-info">
                  <svg className="hero-scan-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Checks permissions, network access, version history, and known threats.
                </p>
                {!isAuthenticated && scanInput.trim() && (
                  <p className="auth-hint">
                    Sign in required to scan. View existing reports on{" "}
                    <a href="/scan" onClick={(e) => { e.preventDefault(); navigate("/scan"); }}>/scan</a>
                  </p>
                )}
                {scanError && <p className="scan-error-hint">{scanError}</p>}
              </div>

              <a
                href="https://app.tango.us/app/workflow/Scan-Google-Translate-Extension-with-ExtensionShield-c1e43d157b434aedbaff4176df94d55d"
                target="_blank"
                rel="noopener noreferrer"
                className="hero-demo-link"
                title="Copy extension URL → paste here (step-by-step)"
              >
                <span className="hero-demo-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <span>Watch demo</span>
              </a>
            </motion.div>

            {/* Right Panel - 3D orbital carousel with focus report card */}
            <motion.div
              className="hero-right"
              initial={{ opacity: 0, x: 24 }}
              animate={isVisible ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            >
              <HeroOrbitalCarousel />
            </motion.div>
          </div>

          {/* Stats Bar - anchored at bottom */}
          <motion.div
            className="stats-bar"
            initial={{ opacity: 0, y: 20 }}
            animate={isVisible ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="stat-item">
              <span className="stat-value beta">
                <span className="beta-dot" />
                BETA
              </span>
              <span className="stat-label">Free to scan</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-value">47+</span>
              <span className="stat-label">Security rules</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-value">&lt;&nbsp;60s</span>
              <span className="stat-label">Scan time</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-value live" data-stat="extensions-scanned">
                <span className="live-dot" aria-hidden="true" />
                <span className="stat-value-number">{displayCount.toLocaleString()}+</span>
              </span>
              <span className="stat-label">Extensions scanned</span>
            </div>
          </motion.div>

          {/* Scroll Cue */}
          <motion.button
            type="button"
            className="scroll-cue"
            onClick={scrollToProof}
            initial={{ opacity: 0 }}
            animate={isVisible ? { opacity: 1 } : {}}
            transition={{ delay: 0.8, duration: 0.4 }}
            aria-label="Scroll to see how extensions can turn risky"
          >
            <span>See how extensions can turn risky</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </motion.button>
          </div>
        </section>

      {/* Bridge Section - How trusted extensions turn risky */}
      <section 
        id="proof" 
        className={`bridge-section reveal-section ${revealedSections['proof'] ? 'revealed' : ''}`}
      >
        <div className="bridge-gradient-top" />
        <div className="bridge-container">
          <h2 className="bridge-title">How trusted extensions turn risky</h2>
          
          <div className="bridge-steps">
            <div className="bridge-step">
              <div className="step-number">1</div>
              <div className="step-icon trust">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
              <h3>Earn trust</h3>
              <p>5-star ratings, millions of installs, verified badge.</p>
            </div>

            <div className="bridge-connector">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>

            <div className="bridge-step">
              <div className="step-number">2</div>
              <div className="step-icon update">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <h3>Ship an update</h3>
              <p>Payload hidden in a routine "bug fix" release.</p>
            </div>

            <div className="bridge-connector">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>

            <div className="bridge-step">
              <div className="step-number">3</div>
              <div className="step-icon abuse">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3>Abuse permissions</h3>
              <p>Data theft, ad injection, affiliate hijacking.</p>
            </div>
          </div>

          <p className="bridge-footer">
            Many extensions don't start malicious — they become risky after they're trusted.
          </p>
        </div>
      </section>

      {/* Real Extension Listings - Below Extensions Flow */}
      <section 
        id="deception" 
        className={`deception-section reveal-section ${revealedSections['deception'] ? 'revealed' : ''}`}
      >
        <div className="deception-container">
          <p className="deception-disclaimer">Examples from the Chrome Web Store</p>
          
          <div className="deception-carousel-wrapper">
            <button
              type="button"
              className="deception-carousel-btn deception-carousel-prev"
              onClick={() => setExtensionSlideIndex((i) => (i <= 0 ? 2 : i - 1))}
              aria-label="View previous extensions"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div className={`deception-cards-grid ${EXTENSION_CARDS.slice(extensionSlideIndex * 3, extensionSlideIndex * 3 + 3).length === 2 ? 'two-cards' : ''}`}>
              {EXTENSION_CARDS.slice(extensionSlideIndex * 3, extensionSlideIndex * 3 + 3).map((ext) => (
                <div key={ext.id} className="deception-card surface-card">
                  <div className="card-trust-layer">
                    <div className={`ext-icon ${ext.iconClass}`}>
                      {ext.logoUrl ? (
                        <>
                          <img 
                            src={ext.logoUrl} 
                            alt="" 
                            className="ext-logo-img"
                            onError={(e) => {
                              e.target.style.display = "none";
                              const parent = e.target.closest(".ext-icon");
                              const fallback = parent?.querySelector(".ext-logo-fallback");
                              if (fallback) fallback.classList.add("show");
                            }}
                          />
                          <span className="ext-logo-fallback">{ext.iconSvg}</span>
                        </>
                      ) : (
                        <span className="ext-logo-fallback show">{ext.iconSvg}</span>
                      )}
                    </div>
                    <h4 className="ext-name">{ext.name}</h4>
                    <div className="ext-rating">
                      <div className="stars">{ext.stars}</div>
                      <span className="rating-score">{ext.rating}</span>
                    </div>
                    <div className="ext-users">{ext.users}</div>
                    <div className="ext-verified">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Store badge: {ext.badge}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <button
              type="button"
              className="deception-carousel-btn deception-carousel-next"
              onClick={() => setExtensionSlideIndex((i) => (i >= 2 ? 0 : i + 1))}
              aria-label="View next extensions"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          <div className="deception-footer-block">
            <p className="deception-footer">Approved store listings aren't a guarantee of safety.</p>
            <p className="deception-footer">Ratings and installs can change over time.</p>
          </div>
        </div>
      </section>

      {/* Honey Case Study Section */}
      <section className="honey-case-study">
        <div className="case-study-container">
          {/* Header */}
          <div className="case-study-header">
            <span className="case-study-badge">CASE STUDY</span>
            <h2 className="case-study-title">
              Honey Extension Case Study
              <span className="subtitle">17M+ users reported. $4B acquisition.</span>
            </h2>
          </div>

          {/* Main Content Grid */}
          <div className="case-study-content">
            {/* Left: Honey Icon */}
            <div className="honey-icon-section">
              <div className="honey-icon-wrapper">
                {/* Animated rings */}
                <div className="honey-ring honey-ring-1" />
                <div className="honey-ring honey-ring-2" />
                <div className="honey-ring honey-ring-3" />
                
                {/* Honey Logo - Hexagon with honeycomb pattern */}
                <div className="honey-logo">
                  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Hexagon background */}
                    <path 
                      d="M50 5L93.3 27.5V72.5L50 95L6.7 72.5V27.5L50 5Z" 
                      fill="url(#honeyGradient)" 
                      stroke="url(#honeyStroke)"
                      strokeWidth="2"
                    />
                    {/* Honeycomb cells */}
                    <path d="M50 30L62 38V54L50 62L38 54V38L50 30Z" fill="rgba(255,255,255,0.15)" />
                    <path d="M35 45L47 53V69L35 77L23 69V53L35 45Z" fill="rgba(255,255,255,0.1)" />
                    <path d="M65 45L77 53V69L65 77L53 69V53L65 45Z" fill="rgba(255,255,255,0.1)" />
                    {/* Letter H */}
                    <text x="50" y="58" textAnchor="middle" fill="white" fontSize="28" fontWeight="bold" fontFamily="Arial">h</text>
                    <defs>
                      <linearGradient id="honeyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FF9500" />
                        <stop offset="50%" stopColor="#FF6B00" />
                        <stop offset="100%" stopColor="#E85D04" />
                      </linearGradient>
                      <linearGradient id="honeyStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FFB347" />
                        <stop offset="100%" stopColor="#FF8C00" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                
                {/* Warning badge */}
                <div className="warning-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
              </div>
              
              <div className="honey-stats">
                <div className="honey-stat">
                  <span className="stat-number">17M+</span>
                  <span className="stat-desc">Reported Users</span>
                </div>
                <div className="honey-stat">
                  <span className="stat-number">$4B</span>
                  <span className="stat-desc">Acquisition</span>
                </div>
                <div className="honey-stat">
                  <span className="stat-number danger">—</span>
                  <span className="stat-desc">Savings Not Guaranteed</span>
                </div>
              </div>
            </div>

            {/* Right: Scam Details */}
            <div className="scam-details">
              <div className="scam-intro">
                <p>
                  Promised savings. Investigators reported <strong>commission diversion</strong> and <strong>alleged worse deals</strong>.
                </p>
              </div>

              <div className="scam-points">
                <div className="scam-point">
                  <div className="point-icon theft">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4M12 16h.01" />
                    </svg>
                  </div>
                  <div className="point-content">
                    <h4>Affiliate Link Hijacking</h4>
                    <p>Investigators found silent overwriting of creator affiliate codes. Creators reported lost commissions.</p>
                  </div>
                </div>

                <div className="scam-point">
                  <div className="point-icon data">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </div>
                  <div className="point-content">
                    <h4>Shopping Surveillance</h4>
                    <p>Investigators reported tracking of views, carts, and purchases. Data reportedly shared with retailers.</p>
                  </div>
                </div>

                <div className="scam-point">
                  <div className="point-icon fake">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </div>
                  <div className="point-content">
                    <h4>Disputed "Best" Coupons</h4>
                    <p>Users reported finding better deals publicly. The coupon animation was questioned by investigators.</p>
                  </div>
                </div>

                <div className="scam-point">
                  <div className="point-icon money">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="1" x2="12" y2="23" />
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                  </div>
                  <div className="point-content">
                    <h4>Retailer Kickbacks</h4>
                    <p>Investigators reported payments to prioritize certain deals. Users disputed whether they received the best available price.</p>
                  </div>
                </div>
              </div>

              <div className="scam-footer">
                <div className="exposed-by">
                  <span>Exposed by</span>
                  <strong>MegaLag</strong>
                  <span className="date">• December 2024</span>
                </div>
                <div className="verdict">
                  <span className="verdict-label">VERDICT</span>
                  <span className="verdict-value">DECEPTIVE PRACTICES</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="pricing-section">
        <div className="pricing-header">
          <h2>Simple, Transparent Pricing</h2>
          <p>Scanning is free for individuals. We reuse results for extensions we've seen before (instant), and run fresh full analysis only when needed.</p>
        </div>

        <div className="pricing-grid">
          {/* Community Plan */}
          <div className="pricing-card surface-card popular">
            <div className="popular-badge">BETA</div>
            <div className="pricing-card-header">
              <h3>Community</h3>
              <p>Free during beta — help us test</p>
            </div>
            <div className="pricing-amount">
              <span className="price">$0</span>
              <span className="credits">Beta Launch</span>
            </div>
            <div className="scan-credit-note">
              Full analysis runs only when we haven't seen this exact extension version before; repeat scans use cached results (instant).
            </div>
            <ul className="pricing-features">
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>Unlimited cached lookups (always free)</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>2 full scans per day per account (new versions only)</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>Full security report (not blurred)</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>AI threat analysis + VirusTotal/threat intel</span>
              </li>
            </ul>
            <button className="pricing-btn popular-btn" onClick={() => navigate("/scan")}>Start Free</button>
          </div>

          {/* Enterprise Plan */}
          <div className="pricing-card surface-card enterprise">
            <div className="pricing-card-header">
              <h3>Enterprise</h3>
              <p>Teams & governance</p>
            </div>
            <div className="pricing-amount">
              <span className="price">Contact</span>
              <span className="price-period">Sales</span>
            </div>
            <div className="scan-credit-note">
              For teams that need monitoring, governance, and audit-ready exports. Helps flag risk signals—not a guarantee.
            </div>
            <ul className="pricing-features">
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>Monitoring & auto-rescan on updates</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>Alerting when risk changes</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>Policy packs + audit exports</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>Org allow/block list governance</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>SSO/RBAC <span className="coming-soon-tag">Coming soon</span></span>
              </li>
            </ul>
            <button className="pricing-btn enterprise-btn" onClick={() => navigate("/enterprise")}>Request Enterprise Pilot</button>
          </div>
        </div>

        {/* Community Contribution */}
        <div className="karma-panel">
          <div className="karma-content">
            {/* Icon Section */}
            <div className="karma-icon-section">
              <div className="karma-icon-wrapper">
                <div className="karma-ring karma-ring-1" />
                <div className="karma-ring karma-ring-2" />
                <div className="karma-icon-main">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Text Section */}
            <div className="karma-text-section">
              <h4>Share your feedback with the community.</h4>
              <p>
                Help others by sharing extension insights, reporting issues, or recommending alternatives you trust.
                Your contributions help build a more transparent ecosystem.
              </p>
              <div className="karma-actions">
                <div className="karma-action-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Verify findings</span>
                </div>
                <div className="karma-action-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Report issues</span>
                </div>
                <div className="karma-action-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  <span>Recommend safe alternatives</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      </div>
    </>
  );
};

export default HomePage;
