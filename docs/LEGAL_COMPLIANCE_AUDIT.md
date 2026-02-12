# ExtensionShield — Legal & Trust Audit Report

**Context:** Chrome extension security scanner / risk scoring product.  
**Scope:** Public-facing website (frontend + key copy).  
**Date:** February 12, 2026.  
**Auditor role:** Website compliance + legal wording auditor (not a lawyer). This is not legal advice.

---

## 1. Site map (public-facing)

| Type | Routes / Pages |
|------|----------------|
| **Marketing** | `/` (Home), `/scan`, `/enterprise`, `/about`, `/open-source`, `/community` |
| **Scan / reports** | `/scan`, `/scan/history`, `/scan/progress/:scanId`, `/scan/results/:scanId`, `/extension/:id`, `/extension/:id/version/:hash`, `/reports`, `/reports/:reportId` |
| **Research** | `/research`, `/research/case-studies`, `/research/case-studies/honey`, `/research/methodology`, `/research/benchmarks` |
| **Resources** | `/privacy-policy`, `/glossary`, `/contribute`, `/gsoc/ideas`, `/gsoc/blog`, `/gsoc/community`, `/settings` |
| **Auth** | `/auth/callback`, `/auth/diagnostics` |

**Footer links (current):** How We Score, Privacy Policy, Contribute, GitHub.  
**Missing from footer:** Terms of Service, Disclaimer, Contact, Refund (N/A for now — no paid product).

**Key trust/claim surfaces:** Hero “safety report”, “Chrome Extension Scanner”, deception section (“Approved store listings aren’t a guarantee of safety”), Honey case study, pricing (“not a guarantee”), report verdicts (“Safe to use”, “SAFETY SCORE”), methodology (“GDPR/SOC2”), footer disclaimer (“trust the results”).

---

## 2. Executive summary

- **Terms of Service:** Sign-in flow says users “agree to our Terms of Service” but there is **no Terms of Service page** and links use `#terms` / `#privacy` (broken). This is a **blocker** before requiring agreement.
- **Warranty-like language:** Report pages show **“Safe to use”** and **“This extension appears safe. No immediate action required.”** without “based on our analysis” or “not a guarantee.” Similar risk with **“SAFETY SCORE”** and **“Malware Free”** without qualification.
- **Footer disclaimer** says “So you can **trust the results** you find” — can be read as a guarantee; recommend softening.
- **Privacy Policy** is solid (cookies, retention, rights, contact, “we do not sell”, no 100% security guarantee). Missing: explicit **“Do Not Sell My Personal Information”** (CCPA) and, if you have EU/UK traffic, a **cookie/consent** disclosure or banner.
- **Honey case study** uses “Investigators reported,” “alleged,” “disputed” in body (good). Category label **“Affiliate Fraud”** is strong; consider “Reported affiliate practices” or keep with a clear “alleged” in the intro.
- **Methodology “GDPR/SOC2”** tag can imply certification; clarify it’s about **regulatory alignment**, not that ExtensionShield is certified.
- **Chrome / Google / Drupal** usage is nominative (product name, store, open-source program) — no false endorsement. **No cookie consent banner** found; add if you target EU/UK.
- **Billing/refunds:** Free tier + “Contact” for Enterprise; when you add paid terms, add clear pricing, renewal, cancellation, and refund policy.

---

## 3. Findings by severity

### BLOCKER (fix before public launch)

| # | Where | Risk | Fix |
|---|--------|------|-----|
| B1 | **SignInModal.jsx** — “By signing in, you agree to our Terms of Service and Privacy Policy” with `href="#terms"` and `href="#privacy"` | You require agreement to Terms but (1) there is no Terms of Service page, (2) `#terms` / `#privacy` do not go to real pages. Creates unenforceable consent and bad UX. | Add a **Terms of Service** page (see “Missing policies” below). Add route `/terms` (or `/terms-of-service`). In SignInModal, use `<Link to="/terms">Terms of Service</Link> and <Link to="/privacy-policy">Privacy Policy</Link>`. |
| B2 | **ReportDetailPage.jsx** (lines ~865, 1073–1074) — “Safe to use” and “This extension appears safe. No immediate action required.” | Reads as a warranty or guarantee of safety. Could create liability if a user relies on it and is harmed. | **BEFORE:** “Safe to use” / “This extension appears safe. No immediate action required.” **AFTER:** “Based on our analysis, this extension appears lower risk. No immediate action required. This is not a guarantee of safety.” Add a short disclaimer near the verdict (e.g. “Our score reflects our analysis only; it is not a guarantee.”). |

### HIGH (high risk; fix soon)

| # | Where | Risk | Fix |
|---|--------|------|-----|
| H1 | **navigation.js** — `footerConfig.disclaimer`: “So you can **trust the results** you find.” | “Trust the results” can be read as promising accuracy or reliability. | **AFTER:** “So you can make more informed decisions about the extensions you use.” (Or: “Our analysis is designed to help you understand extension risk; we don’t guarantee results.”) |
| H2 | **HomePage.jsx** (line ~458) — “5-star ratings, millions of installs, **verified badge**.” (in “Earn trust” step) | Could imply that store “verified” = safe, or that ExtensionShield “verifies.” | **AFTER:** “5-star ratings, millions of installs, store badge.” Add one line nearby: “Store badges and ratings do not guarantee safety.” (You already have “Approved store listings aren’t a guarantee of safety” below — keep it.) |
| H3 | **ScanResultsPageV2.jsx** (label “SAFETY SCORE”) and **RiskDial.jsx** (default label “SAFETY SCORE”) | “Safety score” can imply a guarantee. No “not a guarantee” next to the score. | Keep “SAFETY SCORE” but add a one-line disclaimer near the dial: “Our score is based on automated analysis and is not a guarantee of safety.” (Or use “Risk score” and clarify “higher = lower risk in our analysis.”) |
| H4 | **ReportDetailPage.jsx** (Security tab) — “Malware Free” / “No known malware detected” | Could be read as “guaranteed no malware.” | **AFTER:** “No known malware detected in this scan” or “Malware check: no known malware detected by our current checks (not a guarantee).” |
| H5 | **MethodologyPage.jsx** (lines ~182, 186) — “regulatory alignment (GDPR, SOC2)” and feature tag “**GDPR/SOC2**” | Readers may think ExtensionShield is GDPR or SOC2 *certified*. | **AFTER:** “Permission justification, regulatory alignment (e.g. GDPR, SOC2-style controls), developer reputation, and custom policy enforcement.” Tag: “GDPR/SOC2 alignment” or “Privacy & compliance signals” — avoid “certified” unless you are. |
| H6 | **Cookie consent** | Privacy Policy says you use cookies for auth, security, and analytics. If you have EU/UK users, you may need consent for non-essential cookies. | Add a cookie/consent banner or at least a clear “Cookie policy” / “Cookie settings” link and a short notice on first visit (e.g. “We use cookies for … [Accept] [Manage]”). Document in Privacy Policy. |
| H7 | **PrivacyPolicyPage.jsx** — No explicit “Do Not Sell My Personal Information” | CCPA requires a clear way for California consumers to opt out of “sale”/“share.” You say “We do not sell” — good. Adding an explicit “Do Not Sell” link/statement is best practice. | In “Your Rights and Choices,” add: “We do not sell your personal information. If you are a California resident, you may contact us at privacy@extensionshield.com with ‘Do Not Sell’ in the subject line to confirm or exercise your choices.” (Adjust if you later add “share” for targeted ads.) |

### MEDIUM

| # | Where | Risk | Fix |
|---|--------|------|-----|
| M1 | **HoneyCaseStudyPage.jsx** — Category badge “**Affiliate Fraud**” and verdict “DECEPTIVE PRACTICES” | Strong legal characterizations. Body correctly uses “Investigators reported,” “alleged,” “disputed.” | Keep body as is. Consider changing badge to “Reported affiliate practices” or add one line at top: “This case study summarizes reported allegations and investigations; it is not a legal finding.” |
| M2 | **GlossaryPage.jsx** and **FAQ (HomePage/ScannerPage)** — Risk score definition | No “not a guarantee” in definition. | Add to Risk Score definition: “Scores are indicative only and do not guarantee that an extension is safe or unsafe.” |
| M3 | **Footer** — No “Contact” link | Users expect a way to reach you from the footer. | Add “Contact” to `footerConfig.links` (e.g. `mailto:support@extensionshield.com` or a `/contact` page). |
| M4 | **ReportDetailPage.jsx** — “No known malware detected” (VirusTotal) | Relies on third-party data; not qualified. | Same as H4: “No known malware detected in this scan” and/or “(based on VirusTotal and our checks; not a guarantee).” |

### LOW / NICE-TO-HAVE

| # | Where | Risk | Fix |
|---|--------|------|-----|
| L1 | **SignInModal** — Links are in-page anchors | Even after adding `/terms`, current `#privacy` doesn’t go to Privacy. | Use `<Link to="/privacy-policy">` and `<Link to="/terms">` (or your chosen path). |
| L2 | **Pricing (HomePage)** — “Helps flag risk signals—not a guarantee” (Enterprise) | Good. | Keep. Optionally add same idea under Community: “Our reports help you understand risk; they are not a guarantee of safety.” |
| L3 | **AboutUsPage.jsx** — “Google Open Source program,” “Drupal” | Nominative use; no false affiliation. | No change. |
| L4 | **Refund policy** | No paid product yet. | When you add paid plans, add a Refund policy (and link from footer if you link other legal pages). |
| L5 | **trends.json** — “Official Chrome Web Store” | Describes data source, not your affiliation. | No change. |

---

## 4. Top 10 copy fixes (BEFORE → AFTER)

| # | Location | BEFORE | AFTER |
|---|----------|--------|--------|
| 1 | ReportDetailPage (verdict) | Safe to use | Based on our analysis, this extension appears lower risk. Not a guarantee of safety. |
| 2 | ReportDetailPage (Actions card) | This extension appears safe. No immediate action required. | Based on our analysis, no immediate action required. This is not a guarantee of safety. |
| 3 | navigation.js (footer) | So you can trust the results you find. | So you can make more informed decisions about the extensions you use. |
| 4 | HomePage (bridge step) | 5-star ratings, millions of installs, verified badge. | 5-star ratings, millions of installs, store badge. (Add: Store badges don’t guarantee safety.) |
| 5 | ReportDetailPage (Security tab) | Malware Free — No known malware detected | No known malware detected in this scan (not a guarantee). |
| 6 | MethodologyPage | regulatory alignment (GDPR, SOC2) / tag “GDPR/SOC2” | regulatory alignment (e.g. GDPR, SOC2-style controls) / tag “GDPR/SOC2 alignment” |
| 7 | ScanResultsPageV2 / RiskDial | (no disclaimer) | Add under dial: “Our score is based on automated analysis and is not a guarantee of safety.” |
| 8 | GlossaryPage (Risk Score) | [current definition only] | Add: “Scores are indicative only and do not guarantee that an extension is safe or unsafe.” |
| 9 | SignInModal | `<a href="#terms">` / `<a href="#privacy">` | `<Link to="/terms">Terms of Service</Link>` and `<Link to="/privacy-policy">Privacy Policy</Link>` |
| 10 | HoneyCaseStudyPage (optional) | Category: “Affiliate Fraud” | “Reported affiliate practices” or keep with intro: “Summarizes reported allegations; not a legal finding.” |

---

## 5. Missing policies / pages

### 5.1 Terms of Service (missing — required)

- **Route:** e.g. `/terms` or `/terms-of-service`.
- **Suggested sections (outline):**
  - **Acceptance:** By using the Service you agree to these Terms.
  - **Description of Service:** Extension security scanning and related features; we may change or discontinue features.
  - **No warranty:** Service and reports are provided “as is.” We do not guarantee accuracy, completeness, or that any extension is safe or unsafe. **Not a guarantee of safety.**
  - **Limitation of liability:** To the extent permitted by law, we are not liable for indirect, incidental, or consequential damages, or for decisions you make based on our reports. Cap liability at the amount you paid us in the last 12 months (or $0 if free).
  - **Acceptable use:** No abuse of the Service (e.g. excessive scanning, scraping, circumventing access controls). No use to violate laws or third-party rights.
  - **Account/termination:** We may suspend or terminate access for breach. You may stop using the Service at any time.
  - **Dispute resolution / governing law:** Optional — e.g. “Governed by the laws of [State]. Disputes resolved in [courts/arbitration].”
  - **Changes:** We may update Terms; continued use after notice means acceptance. Link to Privacy Policy and contact (e.g. support@extensionshield.com).
- **Footer:** Add “Terms of Service” to `footerConfig.links` pointing to this page.

### 5.2 Disclaimer (missing — recommended)

- **Options:** Dedicated `/disclaimer` page **or** a short “Disclaimer” block on Home and/or Scan/Report pages.
- **Suggested content (bullets):**
  - Our reports and scores are **informational only** and based on automated and third-party analysis. They are **not legal, security, or professional advice**.
  - **No warranty:** We do not guarantee that an extension is safe or unsafe. Store approval and ratings do not guarantee safety.
  - **Your responsibility:** You decide whether to install or trust an extension. Use our tool as one input among others.
  - **Third-party data:** We use sources like VirusTotal and the Chrome Web Store; we don’t guarantee their accuracy or completeness.
- **Placement:** Link “Disclaimer” in footer and/or near the main scan input and report verdict.

### 5.3 Cookie / consent (if EU/UK traffic)

- **Privacy Policy** already describes cookies. Add:
  - A short first-visit notice or banner: e.g. “We use cookies for authentication, security, and analytics. [Accept] [Learn more].”
  - “Learn more” → Privacy Policy #cookies or a “Cookie policy” subsection.
  - If you use non-essential cookies (e.g. marketing/analytics), consider a “Manage preferences” to opt out where required.

### 5.4 Refund policy (when you have paid plans)

- **Suggested outline:** Eligibility (e.g. within 14 days of charge), how to request (email/link), processing time, prorated or full refund as applicable, exclusions (e.g. abuse). Link from footer and from checkout.

---

## 6. Quick patch reference (file paths + exact strings)

| File | Current string | Replace with |
|------|----------------|-------------|
| `frontend/src/nav/navigation.js` | `So you can trust the results you find.` | `So you can make more informed decisions about the extensions you use.` |
| `frontend/src/pages/HomePage.jsx` | `5-star ratings, millions of installs, verified badge.` | `5-star ratings, millions of installs, store badge.` (and add one line: Store badges don’t guarantee safety.) |
| `frontend/src/pages/reports/ReportDetailPage.jsx` | `Safe to use` (verdict) | `Lower risk (not a guarantee)` or `Based on our analysis, lower risk` + disclaimer line |
| `frontend/src/pages/reports/ReportDetailPage.jsx` | `This extension appears safe. No immediate action required.` | `Based on our analysis, no immediate action required. This is not a guarantee of safety.` |
| `frontend/src/pages/reports/ReportDetailPage.jsx` | `Malware Free` / `No known malware detected` | `No known malware detected in this scan (not a guarantee).` |
| `frontend/src/pages/research/MethodologyPage.jsx` | `Permission justification, regulatory alignment (GDPR, SOC2), developer reputation...` | `Permission justification, regulatory alignment (e.g. GDPR, SOC2-style controls), developer reputation...` |
| `frontend/src/pages/research/MethodologyPage.jsx` | `<div className="feature-tag">GDPR/SOC2</div>` | `<div className="feature-tag">GDPR/SOC2 alignment</div>` |
| `frontend/src/components/SignInModal.jsx` | `<a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>` | `<Link to="/terms">Terms of Service</Link> and <Link to="/privacy-policy">Privacy Policy</Link>` (after creating `/terms`) |
| `frontend/src/pages/GlossaryPage.jsx` (Risk Score definition) | [append] | Add: `Scores are indicative only and do not guarantee that an extension is safe or unsafe.` |
| `frontend/src/pages/PrivacyPolicyPage.jsx` (Your Rights) | [add after rights list] | “We do not sell your personal information. California residents may contact privacy@extensionshield.com with ‘Do Not Sell’ to confirm or exercise choices.” |

---

## 7. Checklist summary

| Area | Status | Notes |
|------|--------|--------|
| Misleading claims / warranties | ⚠️ Fix | “Safe to use,” “trust the results,” “verified badge,” “Malware Free” — qualify and add disclaimers. |
| Competitor / third-party (Honey) | ✅ Mostly OK | Use “alleged,” “reported,” “disputed”; consider softening category label. |
| Privacy / data | ✅ Good | Policy has cookies, retention, rights, contact, “we do not sell.” Add CCPA “Do Not Sell” and cookie consent if EU/UK. |
| Terms / disclaimers | ❌ Missing | Add Terms of Service; add Disclaimer section or page; add “not a guarantee” near scores and verdicts. |
| Billing / refunds | ➖ N/A for now | When you add paid, add clear terms and refund policy. |
| Trust signals (verified, score) | ⚠️ Fix | Clarify “store badge” vs “verified”; add score/verdict disclaimers. |
| Trademark (Chrome, Google, Drupal) | ✅ OK | Nominative use; no false endorsement. |
| Dark patterns | ✅ OK | No forced consent or misleading buttons found. |

---

*End of audit. Have a lawyer review Terms and Privacy before relying on them in your jurisdiction.*
