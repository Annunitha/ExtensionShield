import React from "react";
import { Navigate, useParams } from "react-router-dom";

// Lazy load pages for better code splitting
const HomePage = React.lazy(() => import("../pages/HomePage"));
const ScannerPage = React.lazy(() => import("../pages/scanner/ScannerPage"));
const ScanProgressPage = React.lazy(() => import("../pages/scanner/ScanProgressPage"));
const ScanResultsPageV2 = React.lazy(() => import("../pages/scanner/ScanResultsPageV2"));
const ScanResultsDashboardPage = React.lazy(() => import("../pages/scanner/ScanResultsDashboardPage"));
const ScanHistoryPage = React.lazy(() => import("../pages/ScanHistoryPage"));
const EnterprisePage = React.lazy(() => import("../pages/EnterprisePage"));
const SettingsPage = React.lazy(() => import("../pages/SettingsPage"));
const PrivacyPolicyPage = React.lazy(() => import("../pages/PrivacyPolicyPage"));
const AuthCallbackPage = React.lazy(() => import("../pages/auth/AuthCallbackPage"));
const AuthDiagnosticsPage = React.lazy(() => import("../pages/auth/AuthDiagnosticsPage"));

// Research Pages
const ResearchPage = React.lazy(() => import("../pages/research/ResearchPage"));
const MethodologyPage = React.lazy(() => import("../pages/research/MethodologyPage"));
const CaseStudiesPage = React.lazy(() => import("../pages/research/CaseStudiesPage"));
const HoneyCaseStudyPage = React.lazy(() => import("../pages/research/HoneyCaseStudyPage"));
const BenchmarksPage = React.lazy(() => import("../pages/research/BenchmarksPage"));

// GSoC / Open Source Pages
const GSoCIdeasPage = React.lazy(() => import("../pages/gsoc/GSoCIdeasPage"));
const ContributePage = React.lazy(() => import("../pages/gsoc/ContributePage"));
const CommunityPage = React.lazy(() => import("../pages/gsoc/CommunityPage"));
const BlogPage = React.lazy(() => import("../pages/gsoc/BlogPage"));
const OpenSourcePage = React.lazy(() => import("../pages/open-source/OpenSourcePage"));
const CommunityLandingPage = React.lazy(() => import("../pages/community/CommunityLandingPage"));
const AboutUsPage = React.lazy(() => import("../pages/AboutUsPage"));

// Redirect /extension/:id to /scan/results/:id (extension route removed)
const RedirectExtensionToScanResults = () => {
  const { extensionId } = useParams();
  return <Navigate to={`/scan/results/${encodeURIComponent(extensionId || "")}`} replace />;
};

// Reports (Enterprise)
const ReportsPage = React.lazy(() => import("../pages/reports/ReportsPage"));
const ReportDetailPage = React.lazy(() => import("../pages/reports/ReportDetailPage"));

/**
 * Route Configuration
 * 
 * Each route object can have:
 * - path: string (required)
 * - element: React component (required)
 * - seo: { title, description, canonical } (optional, for sitemap generation)
 * - priority: number 0-1 (optional, for sitemap)
 * - changefreq: string (optional, for sitemap)
 */
export const routes = [
  // ============ CORE ROUTES ============
  {
    path: "/",
    element: <HomePage />,
    seo: {
      title: "Chrome Extension Scanner",
      description: "Analyze Chrome extensions for hidden threats, malware, and privacy risks. Free security scanning powered by AI and static analysis.",
      canonical: "/"
    },
    priority: 1.0,
    changefreq: "weekly"
  },

  // ============ SCAN ROUTES ============
  {
    path: "/scan",
    element: <ScannerPage />,
    seo: {
      title: "Scan Chrome Extension | ExtensionShield",
      description: "Scan any Chrome extension for security vulnerabilities, privacy risks, and compliance issues.",
      canonical: "/scan"
    },
    priority: 0.9,
    changefreq: "weekly"
  },
  {
    path: "/scan/history",
    element: <ScanHistoryPage />,
    seo: {
      title: "Scan History | ExtensionShield",
      description: "View your Chrome extension scan history and past security reports.",
      canonical: "/scan/history"
    },
    priority: 0.7,
    changefreq: "weekly"
  },
  {
    path: "/scan/progress/:scanId",
    element: <ScanProgressPage />
  },
  {
    path: "/scan/results/:scanId",
    element: <ScanResultsPageV2 />
  },
  {
    path: "/scan/results/dashboard",
    element: <ScanResultsDashboardPage />
  },

  // ============ LEGACY: /extension/:id redirects to scan results ============
  {
    path: "/extension/:extensionId",
    element: <RedirectExtensionToScanResults />
  },
  {
    path: "/extension/:extensionId/version/:buildHash",
    element: <RedirectExtensionToScanResults />
  },

  // ============ RESEARCH ROUTES ============
  {
    path: "/research",
    element: <ResearchPage />,
    seo: {
      title: "Extension Threat Research & Case Studies | ExtensionShield",
      description: "In-depth security research on Chrome extension threats, malware analysis, and case studies.",
      canonical: "/research"
    },
    priority: 0.8,
    changefreq: "weekly"
  },
  {
    path: "/research/case-studies",
    element: <CaseStudiesPage />,
    seo: {
      title: "Extension Security Case Studies | ExtensionShield",
      description: "Real-world case studies of malicious Chrome extensions.",
      canonical: "/research/case-studies"
    },
    priority: 0.8,
    changefreq: "weekly"
  },
  {
    path: "/research/case-studies/honey",
    element: <HoneyCaseStudyPage />,
    seo: {
      title: "Honey Extension Case Study | ExtensionShield",
      description: "Reported analysis of PayPal's Honey extension: alleged affiliate link hijacking, shopping tracking, and disputed savings claims.",
      canonical: "/research/case-studies/honey"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/research/methodology",
    element: <MethodologyPage />,
    seo: {
      title: "How We Score: ExtensionShield Risk Analysis | ExtensionShield",
      description: "Learn how ExtensionShield analyzes Chrome extensions using static analysis, threat intelligence, and evidence chain-of-custody.",
      canonical: "/research/methodology"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/research/benchmarks",
    element: <BenchmarksPage />,
    seo: {
      title: "Benchmarks & Industry Trends | ExtensionShield",
      description: "Transparent metrics: coverage, disagreement, speed, and governance/privacy signals. Open, reproducible comparisons across scanners.",
      canonical: "/research/benchmarks"
    },
    priority: 0.7,
    changefreq: "monthly"
  },

  // ============ ENTERPRISE ROUTES ============
  {
    path: "/enterprise",
    element: <EnterprisePage />,
    seo: {
      title: "Enterprise Extension Security | ExtensionShield",
      description: "Enterprise-grade Chrome extension security with monitoring, governance, and compliance.",
      canonical: "/enterprise"
    },
    priority: 0.8,
    changefreq: "monthly"
  },

  // ============ OPEN SOURCE / GSOC ROUTES ============
  {
    path: "/about",
    element: <AboutUsPage />,
    seo: {
      title: "About Us | ExtensionShield",
      description: "Learn about ExtensionShield's founder, Stanzin, and why this project was created to help users understand browser extension security.",
      canonical: "/about"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/open-source",
    element: <OpenSourcePage />,
    seo: {
      title: "Open Source | ExtensionShield",
      description: "ExtensionShield is open source. Explore our GitHub, contribute code, or join our GSoC program.",
      canonical: "/open-source"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/community",
    element: <CommunityLandingPage />,
    seo: {
      title: "Community | ExtensionShield",
      description: "Safety notes and safer alternatives from the ExtensionShield community.",
      canonical: "/community"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/open-source/gsoc",
    element: <Navigate to="/gsoc/ideas" replace />
  },
  {
    path: "/gsoc/ideas",
    element: <GSoCIdeasPage />,
    seo: {
      title: "Google Summer of Code Ideas | ExtensionShield",
      description: "GSoC project ideas for ExtensionShield: ML detection, browser support, real-time monitoring, and more.",
      canonical: "/gsoc/ideas"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/contribute",
    element: <ContributePage />,
    seo: {
      title: "Contribute to ExtensionShield | Open Source",
      description: "How to contribute to ExtensionShield: setup guide, contribution guidelines, and getting started.",
      canonical: "/contribute"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/gsoc/community",
    element: <CommunityPage />,
    seo: {
      title: "Join the Community | ExtensionShield",
      description: "Join the ExtensionShield community: Discord, GitHub Discussions, and more.",
      canonical: "/gsoc/community"
    },
    priority: 0.5,
    changefreq: "monthly"
  },
  {
    path: "/gsoc/blog",
    element: <BlogPage />,
    seo: {
      title: "Blog | ExtensionShield",
      description: "ExtensionShield blog: updates, tutorials, and research on browser extension security.",
      canonical: "/gsoc/blog"
    },
    priority: 0.5,
    changefreq: "weekly"
  },

  // ============ REPORTS (ENTERPRISE) ============
  {
    path: "/reports",
    element: <ReportsPage />
  },
  {
    path: "/reports/:reportId",
    element: <ReportDetailPage />
  },

  // ============ AUTHENTICATION ============
  {
    path: "/auth/callback",
    element: <AuthCallbackPage />
  },
  {
    path: "/auth/diagnostics",
    element: <AuthDiagnosticsPage />
  },

  // ============ SETTINGS ============
  {
    path: "/settings",
    element: <SettingsPage />
  },
  {
    path: "/privacy-policy",
    element: <PrivacyPolicyPage />,
    seo: {
      title: "Privacy Policy | ExtensionShield",
      description: "ExtensionShield Privacy Policy - Learn how we collect, use, and protect your data.",
      canonical: "/privacy-policy"
    },
    priority: 0.5,
    changefreq: "monthly"
  },
  {
    path: "/glossary",
    element: React.lazy(() => import("../pages/GlossaryPage")),
    seo: {
      title: "Browser Extension Security Glossary | ExtensionShield",
      description: "Learn extension security terms: permissions, MV3, service workers, risk scores, governance, SAST, threat intelligence, privacy signals, and compliance.",
      canonical: "/glossary"
    },
    priority: 0.7,
    changefreq: "monthly"
  },

  // ============ LEGACY REDIRECTS ============
  {
    path: "/scanner",
    element: <Navigate to="/scan" replace />
  },
  {
    path: "/scanner/progress/:scanId",
    element: <Navigate to="/scan/progress/:scanId" replace />
  },
  {
    path: "/scanner/results/:scanId",
    element: <Navigate to="/scan/results/:scanId" replace />
  },
  {
    path: "/history",
    element: <Navigate to="/scan/history" replace />
  },
  {
    path: "/dashboard",
    element: <Navigate to="/scan" replace />
  },
  {
    path: "/scan-history",
    element: <Navigate to="/scan/history" replace />
  },
  {
    path: "/sample-report",
    element: <Navigate to="/research/case-studies/honey" replace />
  },
  {
    path: "/analysis",
    element: <Navigate to="/scan" replace />
  },

  // ============ CATCH-ALL ============
  {
    path: "*",
    element: <Navigate to="/" replace />
  }
];

/**
 * Get all routes that should be in the sitemap
 * Excludes dynamic routes, redirects, and non-SEO routes
 */
export const getSitemapRoutes = () => {
  return routes.filter(route => 
    route.seo && 
    !route.path.includes(":") && 
    !route.path.includes("*")
  );
};

export default routes;

