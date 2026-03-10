#!/usr/bin/env node

/**
 * SEO Smoke Test
 * 
 * Validates critical SEO requirements:
 * - Meta tags (title, description, canonical)
 * - Open Graph and Twitter Card tags
 * - JSON-LD schema markup
 * - Domain redirects (301)
 * - robots.txt behavior
 * - sitemap.xml validation
 * 
 * Usage:
 *   node scripts/seo_smoke_test.mjs [--local] [--prod]
 * 
 * Environment variables:
 *   BASE_URL - Base URL to test (default: https://extensionshield.com)
 *   LOCAL_URL - Local URL for testing (default: http://localhost:5173)
 *   TEST_PAGES - Comma-separated list of paths to test (default: /, /scan, /enterprise, etc.)
 *   SEO_SKIP_ROBOTS_TXT - If set, skip canonical domain robots.txt check (e.g. when prod differs)
 *   SEO_HEAD_WAIT_MS - Timeout for SEO head elements (default: 50000)
 *   SEO_PAGE_TIMEOUT_MS - Page default timeout (default: 55000)
 */

import { chromium } from 'playwright';
import https from 'https';
import http from 'http';
import { URL } from 'url';

// Configuration
const DEFAULT_PROD_URL = 'https://extensionshield.com';
const DEFAULT_LOCAL_URL = 'http://localhost:5173';

const BASE_URL = process.env.BASE_URL || DEFAULT_PROD_URL;
const LOCAL_URL = process.env.LOCAL_URL || DEFAULT_LOCAL_URL;

// Test URLs to validate (configurable via TEST_PAGES env var)
const DEFAULT_TEST_PAGES = [
  '/',
  '/scan',
  '/enterprise',
  '/glossary',
  '/research/methodology',
  '/research/case-studies'
];

const TEST_PAGES = process.env.TEST_PAGES
  ? process.env.TEST_PAGES.split(',').map(p => p.trim())
  : DEFAULT_TEST_PAGES;

// Domains to test redirects
// Note: extensionaudit.com will be added in the future
const REDIRECT_DOMAINS = [
  'extensionscanner.com'
];

const CANONICAL_DOMAIN = 'extensionshield.com';

// Test results
let testsPassed = 0;
let testsFailed = 0;
const failures = [];
/** When running in CI, 403 from prod is treated as skip (prod may block datacenter IPs). */
const skipped403 = [];

/** True when running in GitHub Actions (prod may return 403 for CI IPs). */
const isCI = process.env.GITHUB_ACTIONS === 'true';

/** Browser-like User-Agent so prod WAF is less likely to block requests. */
const BROWSER_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetch HTML from URL
 */
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': BROWSER_USER_AGENT
      },
      timeout: 10000
    };

    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Normalize path for canonical comparison
 * - Remove trailing slash (except root)
 * - Ensure leading slash
 */
function normalizePath(path) {
  if (!path || path === '/') return '/';
  // Ensure leading slash
  let normalized = path.startsWith('/') ? path : `/${path}`;
  // Remove trailing slash (except root)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/** Timeout for waiting on SEO head (lazy-loaded routes may need longer to hydrate). */
const SEO_HEAD_WAIT_MS = Number(process.env.SEO_HEAD_WAIT_MS) || 50000;

/**
 * Parse HTML and extract SEO elements
 */
async function waitForSeoHead(page, { requireOG, requireJSONLD }) {
  // For a client-rendered SPA, SEO tags are injected after JS (and lazy chunks) load.
  // We wait for the key head tags to appear to avoid false negatives.
  await page.waitForFunction(
    () => Boolean(document.title && document.title.trim().length > 0),
    { timeout: SEO_HEAD_WAIT_MS }
  );

  await page.waitForFunction(
    () => Boolean(document.querySelector('meta[name="description"]')?.getAttribute('content')),
    { timeout: SEO_HEAD_WAIT_MS }
  );

  await page.waitForFunction(
    () => Boolean(document.querySelector('link[rel="canonical"]')?.href),
    { timeout: SEO_HEAD_WAIT_MS }
  );

  if (requireOG) {
    await page.waitForFunction(
      () => document.querySelectorAll('meta[property^="og:"]').length > 0,
      { timeout: SEO_HEAD_WAIT_MS }
    );
    await page.waitForFunction(
      () => document.querySelectorAll('meta[name^="twitter:"]').length > 0,
      { timeout: SEO_HEAD_WAIT_MS }
    );
  }

  if (requireJSONLD) {
    await page.waitForFunction(
      () => document.querySelectorAll('script[type="application/ld+json"]').length > 0,
      { timeout: SEO_HEAD_WAIT_MS }
    );
  }
}

async function extractRenderedSEO(page, responseHeaders = {}) {
  const seo = await page.evaluate(() => {
    const og = {};
    document.querySelectorAll('meta[property^="og:"]').forEach((meta) => {
      const property = meta.getAttribute('property');
      const content = meta.getAttribute('content') || '';
      if (property) og[property] = content;
    });

    const twitter = {};
    document.querySelectorAll('meta[name^="twitter:"]').forEach((meta) => {
      const name = meta.getAttribute('name');
      const content = meta.getAttribute('content') || '';
      if (name) twitter[name] = content;
    });

    const jsonLdScripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]')
    ).map((s) => s.textContent || '');

    const description =
      document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

    const canonicalHref = document.querySelector('link[rel="canonical"]')?.href || '';

    const metaRobots =
      document.querySelector('meta[name="robots"]')?.getAttribute('content') || '';

    return {
      title: (document.title || '').trim(),
      description: (description || '').trim(),
      canonical: (canonicalHref || '').trim(),
      og,
      twitter,
      jsonLdScripts,
      metaRobots: (metaRobots || '').trim(),
    };
  });

  return {
    ...seo,
    xRobotsTag: responseHeaders['x-robots-tag'] || null,
  };
}

function parseJsonLdScripts(jsonLdScripts) {
  const schemas = [];
  const errors = [];

  (jsonLdScripts || []).forEach((raw, idx) => {
    const text = (raw || '').trim();
    if (!text) {
      errors.push({ index: idx, error: 'Empty JSON-LD script', snippet: '' });
      return;
    }

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        schemas.push(...parsed);
      } else {
        schemas.push(parsed);
      }
    } catch (e) {
      errors.push({
        index: idx,
        error: e?.message || String(e),
        snippet: text.slice(0, 240),
      });
    }
  });

  return { schemas, errors };
}

function normalizeExpectedCanonical(pathname) {
  const normalizedPath = normalizePath(pathname);
  return `https://${CANONICAL_DOMAIN}${normalizedPath}`;
}

function assertIndexable({ metaRobots, xRobotsTag }, testName) {
  const meta = (metaRobots || '').toLowerCase();
  const header = (xRobotsTag || '').toLowerCase();
  if (meta.includes('noindex') || header.includes('noindex')) {
    failures.push(
      `${testName}: Page should be indexable but has noindex (meta robots: "${metaRobots}", x-robots-tag: "${xRobotsTag}")`
    );
    testsFailed++;
    return false;
  }
  testsPassed++;
  return true;
}

function assertCanonicalExact(canonicalHref, expectedCanonical, testName) {
  if (!canonicalHref) {
    failures.push(`${testName}: Missing canonical tag`);
    testsFailed++;
    return false;
  }

  let u;
  try {
    u = new URL(canonicalHref);
  } catch (e) {
    failures.push(`${testName}: Canonical is not a valid absolute URL: "${canonicalHref}"`);
    testsFailed++;
    return false;
  }

  if (u.protocol !== 'https:' || u.hostname !== CANONICAL_DOMAIN) {
    failures.push(`${testName}: Canonical must be on https://${CANONICAL_DOMAIN}, got: "${canonicalHref}"`);
    testsFailed++;
    return false;
  }

  if (u.search || u.hash) {
    failures.push(`${testName}: Canonical must not include query/hash, got: "${canonicalHref}"`);
    testsFailed++;
    return false;
  }

  const normalized = `https://${CANONICAL_DOMAIN}${normalizePath(u.pathname)}`;
  if (normalized !== expectedCanonical) {
    failures.push(`${testName}: Canonical must exactly equal ${expectedCanonical}, got: "${canonicalHref}"`);
    testsFailed++;
    return false;
  }

  // Enforce normalized canonical formatting (no trailing slash except root)
  if (canonicalHref !== expectedCanonical) {
    failures.push(`${testName}: Canonical href must be normalized to "${expectedCanonical}", got: "${canonicalHref}"`);
    testsFailed++;
    return false;
  }

  testsPassed++;
  return true;
}

/**
 * Extract @type values from JSON-LD schemas
 */
function extractSchemaTypes(jsonLdArray) {
  const types = new Set();
  
  function extractTypes(obj) {
    if (Array.isArray(obj)) {
      obj.forEach(item => extractTypes(item));
    } else if (obj && typeof obj === 'object') {
      if (obj['@type']) {
        if (Array.isArray(obj['@type'])) {
          obj['@type'].forEach(t => types.add(t));
        } else {
          types.add(obj['@type']);
        }
      }
      // Recursively check nested objects
      Object.values(obj).forEach(value => {
        if (typeof value === 'object' && value !== null) {
          extractTypes(value);
        }
      });
    }
  }
  
  jsonLdArray.forEach(schema => extractTypes(schema));
  return Array.from(types);
}

/**
 * Test a single page
 */
async function testPage(page, url, requireOG = false, requireJSONLD = false, requiredSchemaTypes = []) {
  const testName = `Page: ${url}`;
  console.log(`\n🔍 Testing ${testName}...`);

  try {
    const gotoResponse = await page.goto(url, { waitUntil: 'load' });
    const status = gotoResponse?.status?.() ?? null;
    const headers = gotoResponse?.headers?.() ?? {};

    if (status !== 200) {
      if (status === 403 && isCI && url.includes('extensionshield.com')) {
        skipped403.push(testName);
        console.log(`   ⚠️ Skipped (403 - prod may block CI IPs)`);
        return false;
      }
      failures.push(`${testName}: Expected status 200, got ${status}`);
      testsFailed++;
      return false;
    }
    testsPassed++;

    await waitForSeoHead(page, { requireOG, requireJSONLD });
    const seo = await extractRenderedSEO(page, headers);

    // Title exists and non-empty
    if (!seo.title || seo.title.length === 0) {
      failures.push(`${testName}: Missing or empty <title> tag`);
      testsFailed++;
    } else {
      testsPassed++;
    }

    // Meta description exists and > 50 chars
    if (!seo.description || seo.description.length < 50) {
      failures.push(`${testName}: Meta description missing or too short (< 50 chars). Found: "${seo.description}"`);
      testsFailed++;
    } else {
      testsPassed++;
    }

    const finalPathname = new URL(page.url()).pathname;
    const expectedCanonical = normalizeExpectedCanonical(finalPathname);

    // Canonical strictness: must EXACTLY match expected canonical
    if (!assertCanonicalExact(seo.canonical, expectedCanonical, testName)) return false;

    // Indexability checks: no noindex on canonical pages
    if (!assertIndexable(seo, testName)) return false;

    // OG tags correctness (if required)
    if (requireOG) {
      const requiredOGTags = ['og:title', 'og:description', 'og:url', 'og:type'];
      for (const tag of requiredOGTags) {
        if (!seo.og[tag]) {
          failures.push(`${testName}: Missing required OG tag: ${tag}`);
          testsFailed++;
        } else {
          testsPassed++;
        }
      }
      
      // OG URL must equal expected canonical (exact)
      const ogUrl = seo.og['og:url'] || '';
      if (!ogUrl) {
        failures.push(`${testName}: Missing required OG tag: og:url`);
        testsFailed++;
      } else {
        if (!assertCanonicalExact(ogUrl, expectedCanonical, `${testName} (og:url)`)) return false;
      }

      // OG title must be non-empty
      if (!seo.og['og:title'] || seo.og['og:title'].trim().length === 0) {
        failures.push(`${testName}: og:title must be non-empty`);
        testsFailed++;
      } else {
        testsPassed++;
      }
    }

    // Twitter tags correctness (if required)
    if (requireOG) {
      const requiredTwitterTags = ['twitter:card', 'twitter:title', 'twitter:description'];
      for (const tag of requiredTwitterTags) {
        if (!seo.twitter[tag]) {
          failures.push(`${testName}: Missing required Twitter tag: ${tag}`);
          testsFailed++;
        } else {
          testsPassed++;
        }
      }
      
      // Twitter title must be non-empty
      if (!seo.twitter['twitter:title'] || seo.twitter['twitter:title'].trim().length === 0) {
        failures.push(`${testName}: twitter:title must be non-empty`);
        testsFailed++;
      } else {
        testsPassed++;
      }
      
      // Twitter card must be present and match our default
      const expectedTwitterCard = 'summary_large_image';
      if (!seo.twitter['twitter:card']) {
        failures.push(`${testName}: Missing required Twitter tag: twitter:card`);
        testsFailed++;
      } else if (seo.twitter['twitter:card'] !== expectedTwitterCard) {
        failures.push(`${testName}: twitter:card must be "${expectedTwitterCard}", got: "${seo.twitter['twitter:card']}"`);
        testsFailed++;
      } else {
        testsPassed++;
      }
    }

    // JSON-LD schema requirements (if required)
    if (requireJSONLD) {
      const { schemas, errors } = parseJsonLdScripts(seo.jsonLdScripts);
      if (errors.length > 0) {
        const details = errors
          .map((e) => `#${e.index}: ${e.error}${e.snippet ? ` (snippet: ${JSON.stringify(e.snippet)})` : ''}`)
          .join(' | ');
        failures.push(`${testName}: Invalid JSON-LD detected: ${details}`);
        testsFailed++;
        return false;
      }

      if (schemas.length === 0) {
        failures.push(`${testName}: Missing JSON-LD schema markup`);
        testsFailed++;
      } else {
        testsPassed++;
        
        // Extract all @type values
        const schemaTypes = extractSchemaTypes(schemas);
        
        // Check for required schema types
        if (requiredSchemaTypes.length > 0) {
          const missingTypes = requiredSchemaTypes.filter(type => !schemaTypes.includes(type));
          if (missingTypes.length > 0) {
            failures.push(`${testName}: Missing required JSON-LD schema types: ${missingTypes.join(', ')}. Found types: ${schemaTypes.join(', ') || 'none'}`);
            testsFailed++;
          } else {
            testsPassed++;
          }
        }
      }
    }

    return true;
  } catch (error) {
    failures.push(`${testName}: Error - ${error.message}`);
    testsFailed++;
    return false;
  }
}

/**
 * Test domain redirect with chain enforcement
 */
async function testRedirect(domain, path = '/anypath', query = 'x=1') {
  const testName = `Redirect: ${domain}${path}?${query}`;
  console.log(`\n🔍 Testing ${testName}...`);

  try {
    const url = `https://${domain}${path}?${query}`;
    const redirectChain = [];
    let currentUrl = url;
    let redirectCount = 0;
    const maxRedirects = 5; // Prevent infinite loops

    // Follow redirect chain
    while (redirectCount < maxRedirects) {
      const response = await fetchHTML(currentUrl);
      redirectChain.push({ url: currentUrl, status: response.status, location: response.headers.location });

      // If not a redirect, stop
      if (response.status !== 301 && response.status !== 302 && response.status !== 307 && response.status !== 308) {
        break;
      }

      // Must be 301 (permanent redirect)
      if (response.status !== 301) {
        failures.push(`${testName}: Expected status 301 (permanent redirect), got ${response.status}`);
        testsFailed++;
        return false;
      }

      const location = response.headers.location;
      if (!location) {
        failures.push(`${testName}: Missing Location header in redirect`);
        testsFailed++;
        return false;
      }

      // Resolve relative URLs
      const locationUrl = new URL(location, currentUrl);
      currentUrl = locationUrl.href;
      redirectCount++;
    }

    // Must be exactly ONE redirect hop
    if (redirectCount === 0) {
      failures.push(`${testName}: Expected 301 redirect, got status ${redirectChain[redirectChain.length - 1]?.status || 'unknown'}`);
      testsFailed++;
      return false;
    }
    testsPassed++;

    if (redirectCount > 1) {
      failures.push(`${testName}: Expected single redirect hop, got ${redirectCount} redirects. Chain: ${redirectChain.map(r => `${r.url} -> ${r.location}`).join(' -> ')}`);
      testsFailed++;
      return false;
    }
    testsPassed++;

    // Location header must point to canonical domain
    const finalLocation = redirectChain[0].location;
    const locationUrl = new URL(finalLocation, url);
    
    // Check host is canonical domain
    if (locationUrl.hostname !== CANONICAL_DOMAIN) {
      failures.push(`${testName}: Location host must be ${CANONICAL_DOMAIN}, got ${locationUrl.hostname}`);
      testsFailed++;
      return false;
    }
    testsPassed++;

    // Check path is preserved
    const normalizedPath = normalizePath(path);
    const locationPath = normalizePath(locationUrl.pathname);
    if (locationPath !== normalizedPath) {
      failures.push(`${testName}: Path not preserved. Expected: ${normalizedPath}, got: ${locationPath}`);
      testsFailed++;
      return false;
    }
    testsPassed++;

    // Check query is preserved
    const expectedQuery = query;
    const locationQuery = locationUrl.search.substring(1); // Remove leading ?
    if (locationQuery !== expectedQuery) {
      failures.push(`${testName}: Query not preserved. Expected: ${expectedQuery}, got: ${locationQuery}`);
      testsFailed++;
      return false;
    }
    testsPassed++;

    return true;
  } catch (error) {
    failures.push(`${testName}: Error - ${error.message}`);
    testsFailed++;
    return false;
  }
}

/**
 * Test robots.txt
 */
async function testRobotsTxt(domain, shouldAllow) {
  const testName = `robots.txt: ${domain}`;
  console.log(`\n🔍 Testing ${testName}...`);

  try {
    const url = `https://${domain}/robots.txt`;
    const response = await fetchHTML(url);

    if (response.status !== 200) {
      if (response.status === 403 && isCI && domain === CANONICAL_DOMAIN) {
        skipped403.push(testName);
        console.log(`   ⚠️ Skipped (403 - prod may block CI IPs)`);
        return false;
      }
      failures.push(`${testName}: Expected status 200, got ${response.status}`);
      testsFailed++;
      return false;
    }
    testsPassed++;

    const content = response.body.toLowerCase();
    // "Disallow: /" as a full line (with optional trailing space) means disallow everything.
    // Do not treat "Disallow: /settings" or "Disallow: /reports" as disallow-all.
    const hasDisallowAll = content.match(/^disallow:\s*\/\s*$/im) !== null;
    const hasAllow = content.includes('allow: /') || (content.includes('user-agent: *') && !hasDisallowAll);

    if (shouldAllow) {
      // Canonical domain should allow crawling
      if (!hasAllow || hasDisallowAll) {
        failures.push(`${testName}: Should allow crawling but robots.txt disallows`);
        testsFailed++;
        return false;
      }
      // Should have sitemap
      if (!content.includes('sitemap:')) {
        failures.push(`${testName}: Should include sitemap reference`);
        testsFailed++;
        return false;
      }
      testsPassed++;
    } else {
      // Non-canonical domains should disallow
      if (!hasDisallowAll) {
        failures.push(`${testName}: Should disallow crawling but robots.txt allows`);
        testsFailed++;
        return false;
      }
      testsPassed++;
    }

    return true;
  } catch (error) {
    failures.push(`${testName}: Error - ${error.message}`);
    testsFailed++;
    return false;
  }
}

/**
 * Test sitemap.xml
 */
async function testSitemap(domain) {
  const testName = `sitemap.xml: ${domain}`;
  console.log(`\n🔍 Testing ${testName}...`);

  try {
    const url = `https://${domain}/sitemap.xml`;
    const response = await fetchHTML(url);

    if (response.status !== 200) {
      if (response.status === 403 && isCI && domain === CANONICAL_DOMAIN) {
        skipped403.push(testName);
        console.log(`   ⚠️ Skipped (403 - prod may block CI IPs)`);
        return false;
      }
      failures.push(`${testName}: Expected status 200, got ${response.status}`);
      testsFailed++;
      return false;
    }
    testsPassed++;

    // Parse XML (simple regex-based parsing for URLs)
    const urlMatches = response.body.match(/<loc>(.*?)<\/loc>/g) || [];
    const urls = urlMatches.map(match => match.replace(/<\/?loc>/g, ''));

    if (urls.length === 0) {
      failures.push(`${testName}: No URLs found in sitemap`);
      testsFailed++;
      return false;
    }

    // All URLs must include canonical domain
    const invalidUrls = urls.filter(url => !url.includes(CANONICAL_DOMAIN));
    if (invalidUrls.length > 0) {
      failures.push(`${testName}: Found URLs not from ${CANONICAL_DOMAIN}: ${invalidUrls.join(', ')}`);
      testsFailed++;
      return false;
    }
    testsPassed++;

    // Check for non-canonical domains
    const nonCanonicalDomains = REDIRECT_DOMAINS.filter(domain => 
      urls.some(url => url.includes(domain))
    );
    if (nonCanonicalDomains.length > 0) {
      failures.push(`${testName}: Found URLs from non-canonical domains: ${nonCanonicalDomains.join(', ')}`);
      testsFailed++;
      return false;
    }
    testsPassed++;

    return true;
  } catch (error) {
    failures.push(`${testName}: Error - ${error.message}`);
    testsFailed++;
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  const args = process.argv.slice(2);
  const testLocal = args.includes('--local');
  const testProd = args.includes('--prod') || (!testLocal && !args.includes('--local'));

  console.log('🚀 ExtensionShield SEO Smoke Test\n');
  console.log(`Testing: ${testProd ? 'PROD' : ''} ${testLocal ? 'LOCAL' : ''}`);
  console.log(`Base URL: ${BASE_URL}`);
  if (testLocal) {
    console.log(`Local URL: ${LOCAL_URL}`);
  }
  console.log('');

  const pagesToTest = [
    ...new Set(
      (TEST_PAGES || [])
        .map((p) => normalizePath(String(p || '').trim()))
        .filter(Boolean)
    ),
  ];

  if (pagesToTest.length === 0) {
    console.error('❌ No TEST_PAGES provided (after normalization).');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  try {
  // Test pages
  if (testProd) {
    console.log('📄 Testing Production Pages...');
    console.log(`   Pages: ${pagesToTest.join(', ')}`);
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(Number(process.env.SEO_PAGE_TIMEOUT_MS) || 55000);
    for (const path of pagesToTest) {
      const url = `${BASE_URL}${path}`;
      const requireOG = path === '/' || path === '/scan';
      const requireJSONLD = path === '/' || path === '/scan';

      // Required schema types per page
      let requiredSchemaTypes = [];
      if (path === '/') {
        requiredSchemaTypes = ['Organization', 'SoftwareApplication', 'FAQPage'];
      } else if (path === '/scan') {
        requiredSchemaTypes = ['SoftwareApplication', 'FAQPage'];
      }

      await testPage(page, url, requireOG, requireJSONLD, requiredSchemaTypes);
    }
    await context.close();
  }

  if (testLocal) {
    console.log('\n📄 Testing Local Pages...');
    console.log(`   Pages: ${pagesToTest.join(', ')}`);
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(40000);
    for (const path of pagesToTest) {
      const url = `${LOCAL_URL}${path}`;
      const requireOG = path === '/' || path === '/scan';
      const requireJSONLD = path === '/' || path === '/scan';
      
      // Required schema types per page
      let requiredSchemaTypes = [];
      if (path === '/') {
        requiredSchemaTypes = ['Organization', 'SoftwareApplication', 'FAQPage'];
      } else if (path === '/scan') {
        requiredSchemaTypes = ['SoftwareApplication', 'FAQPage'];
      }
      
      await testPage(page, url, requireOG, requireJSONLD, requiredSchemaTypes);
    }
    await context.close();
  }

  // Test redirects (production only)
  if (testProd) {
    console.log('\n🔄 Testing Domain Redirects...');
    for (const domain of REDIRECT_DOMAINS) {
      await testRedirect(domain);
    }
  }

  // Test robots.txt (production only). Skip canonical check if SEO_SKIP_ROBOTS_TXT=1 (e.g. prod not yet updated).
  if (testProd) {
    console.log('\n🤖 Testing robots.txt...');
    if (!process.env.SEO_SKIP_ROBOTS_TXT) {
      await testRobotsTxt(CANONICAL_DOMAIN, true);
    } else {
      console.log('   (Skipping canonical domain robots.txt check: SEO_SKIP_ROBOTS_TXT is set)');
    }
    for (const domain of REDIRECT_DOMAINS) {
      await testRobotsTxt(domain, false);
    }
  }

  // Test sitemap (production only)
  if (testProd) {
    console.log('\n🗺️  Testing sitemap.xml...');
    await testSitemap(CANONICAL_DOMAIN);
  }
  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  if (skipped403.length > 0) {
    console.log(`⚠️  Skipped (403): ${skipped403.length}`);
    console.log('   Prod may block CI IPs; run locally or allow GitHub IPs in WAF to run full check.');
  }
  console.log(`📈 Total:  ${testsPassed + testsFailed}`);

  if (failures.length > 0) {
    console.log('\n❌ Failures:');
    failures.forEach((failure, index) => {
      console.log(`  ${index + 1}. ${failure}`);
    });
    console.log('');
    process.exit(1);
  } else {
    console.log('\n✅ All SEO tests passed!');
    if (skipped403.length > 0) {
      console.log(`   (${skipped403.length} check(s) skipped due to 403 from prod in CI)`);
    }
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

