<div align="center">

<div align="center">

  <img src="extension-shield-logo.svg" alt="ExtensionShield" width="98" height="98" />

  # ExtensionShield
</div>

**Chrome Extension Security Scanner & Governance Platform**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE) · [Security](docs/SECURITY.md) · [Get Started](docs/GET_STARTED.md) · [Contribute](docs/CONTRIBUTING.md)

---

ExtensionShield scans Chrome extensions (from the Web Store or CRX/ZIP uploads), runs security and privacy analysis, and produces risk scores and AI-powered summaries. The **core** (scanner, CLI, local analysis) is **MIT-licensed** and works without any cloud. Optional **cloud** features (auth, history, team monitoring, community queue) are available via [ExtensionShield Cloud](https://extensionshield.com).

- **Security**: [SECURITY.md](docs/SECURITY.md) — Reporting vulnerabilities, secrets policy  
- **Open-core**: [OPEN_CORE_BOUNDARIES.md](docs/OPEN_CORE_BOUNDARIES.md) — What's OSS vs Cloud and how it's enforced  

---

## Quick start

<details open>
<summary><strong>1. Clone and install</strong> — click to expand/collapse</summary>

Clone the repo and install backend + frontend dependencies:

```bash
git clone https://github.com/<your-org>/ExtensionShield.git
cd ExtensionShield
make install && cd frontend && npm install
```

> **Tip**: Replace `<your-org>` with your GitHub org or username. Copy the block above and run each line, or run the full snippet in one go.
</details>

<details>
<summary><strong>2. Configure</strong></summary>

Copy environment templates and add your API key for AI summaries:

```bash
cp .env.example .env
# Add OPENAI_API_KEY in .env (for AI summaries). OSS mode is the default.
cp frontend/.env.example frontend/.env
```
</details>

<details>
<summary><strong>3. Run</strong></summary>

Start the API and frontend in two terminals:

```bash
make api      # Terminal 1 → http://localhost:8007
make frontend # Terminal 2 → http://localhost:5173
```

Then open **http://localhost:5173** in your browser.
</details>

Full setup (Docker, CLI, Cloud mode, Make commands): **[GET_STARTED.md](docs/GET_STARTED.md)**.

---

## What ExtensionShield does

| Feature | Description |
|--------|-------------|
| **Scan** | Extensions from the Chrome Web Store or by uploading CRX/ZIP files |
| **Analyze** | Permissions, SAST, entropy, and optional VirusTotal integration |
| **Score** | Security and privacy risk with generated reports |
| **Summarize** | Findings with an LLM (OpenAI or others) |

In **OSS mode** (default) you get the full scanner, CLI, local SQLite storage, and report UI—no cloud required. **Cloud mode** adds auth, scan history, telemetry, and enterprise features; see [GET_STARTED.md](docs/GET_STARTED.md#enabling-cloud-mode) and [OPEN_CORE_BOUNDARIES.md](docs/OPEN_CORE_BOUNDARIES.md).

---

## Documentation

| Document | Description |
|----------|-------------|
| [GET_STARTED.md](docs/GET_STARTED.md) | Setup, config, Docker, CLI, OSS vs Cloud, Make commands |
| [OPEN_CORE_BOUNDARIES.md](docs/OPEN_CORE_BOUNDARIES.md) | OSS vs Cloud; enforcement; configuration |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | How to contribute |
| [SECURITY.md](docs/SECURITY.md) | Reporting vulnerabilities; secrets policy |
| [COMMERCIAL.md](docs/COMMERCIAL.md) | Commercial use (non-binding) |
| [TRADEMARK.md](docs/TRADEMARK.md) | Brand usage guidelines |
| [CODE_OF_CONDUCT.md](docs/CODE_OF_CONDUCT.md) | Community standards |
| [NOTICE](docs/NOTICE) | Third-party attributions |

---

## License & attribution

- **Core** (scanner, CLI, local analysis): **MIT** — see [LICENSE](LICENSE).  
- **Cloud** (auth, Supabase, telemetry admin, community queue, enterprise forms): **proprietary**, available via [ExtensionShield Cloud](https://extensionshield.com).  

Attribution: [NOTICE](docs/NOTICE). Brand: [TRADEMARK.md](docs/TRADEMARK.md). Commercial use: [COMMERCIAL.md](docs/COMMERCIAL.md) (non-binding).

---

## Community

We build ExtensionShield in the open so security tools stay transparent and inspectable. Feedback, issue reports, and small improvements (docs, tests, rule tweaks) are welcome. If it helps you or your organization, consider contributing a PR, sharing your use case, or supporting the project. We run open-source programs and internships when we can—community support helps keep that going.

**Acknowledgments**: ExtensionShield is our own design; we took inspiration from [ThreatXtension](https://github.com/barvhaim/ThreatXtension) in the same space (extension scanning, VirusTotal integration).
