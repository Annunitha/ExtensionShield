import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import RainfallDroplets from "../../components/RainfallDroplets";
import "./CaseStudiesPage.scss";

const CaseStudiesPage = () => {
  const caseStudies = [
    {
      id: "honey",
      title: "The Honey Extension Scam",
      subtitle: "17 Million Users. $4 Billion Acquisition. One Big Lie.",
      date: "December 2024",
      category: "Affiliate Fraud",
      severity: "HIGH",
      description: "How PayPal's Honey extension hijacked affiliate links, tracked shopping behavior, and showed users worse deals than publicly available.",
      featured: true,
    },
    {
      id: "pdf-converters",
      title: "PDF Converter Extensions",
      subtitle: "The Hidden Data Harvesting Network",
      date: "Coming Soon",
      category: "Data Exfiltration",
      severity: "HIGH",
      description: "Analysis of popular PDF converter extensions that harvest document contents and user data.",
      comingSoon: true,
    },
    {
      id: "ad-blockers",
      title: "Fake Ad Blockers",
      subtitle: "Wolves in Sheep's Clothing",
      date: "Coming Soon",
      category: "Malware",
      severity: "CRITICAL",
      description: "How malicious ad blocker clones inject ads instead of blocking them.",
      comingSoon: true,
    },
  ];

  return (
    <>
      <Helmet>
        <title>Extension Security Case Studies | ExtensionShield</title>
        <meta name="description" content="Real-world case studies of malicious Chrome extensions. Learn how Honey, PDF converters, and fake ad blockers deceive millions of users." />
        <link rel="canonical" href="https://extensionshield.com/research/case-studies" />
      </Helmet>

      <div className="case-studies-page">
        <div className="case-studies-bg">
          <div className="bg-gradient" />
        </div>

        <RainfallDroplets />

        <div className="case-studies-content">
          {/* Breadcrumb */}
          <nav className="breadcrumb">
            <Link to="/research">Research</Link>
            <span>/</span>
            <span>Case Studies</span>
          </nav>

          <header className="case-studies-header">
            <h1>Case Studies</h1>
            <p>
              Real-world analysis of malicious and deceptive extensions. 
              Learn the patterns, tactics, and red flags.
            </p>
          </header>

          <div className="case-studies-list">
            {caseStudies.map((study) => (
              <Link
                key={study.id}
                to={study.comingSoon ? "#" : `/research/case-studies/${study.id}`}
                className={`case-study-card ${study.featured ? "featured" : ""} ${study.comingSoon ? "coming-soon" : ""}`}
                onClick={(e) => study.comingSoon && e.preventDefault()}
              >
                <div className="case-study-meta">
                  <span className={`severity-badge ${study.severity.toLowerCase()}`}>
                    {study.severity}
                  </span>
                  <span className="category-badge">{study.category}</span>
                  {study.comingSoon && <span className="coming-soon-badge">Coming Soon</span>}
                </div>
                <h3>{study.title}</h3>
                <p className="subtitle">{study.subtitle}</p>
                <p className="description">{study.description}</p>
                {!study.comingSoon && (
                  <span className="read-more">
                    Read case study
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default CaseStudiesPage;

