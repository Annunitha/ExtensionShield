# ExtensionShield — Project Specification

> **Internal Documentation** — Product capabilities, API reference, and technical details.
> For architecture and implementation details, see [GOVERNANCE_ARCHITECTURE_AND_HLD.md](./GOVERNANCE_ARCHITECTURE_AND_HLD.md)

---

## Overview

**ExtensionShield** is a comprehensive security analysis and governance platform for Chrome browser extensions. It combines static analysis (SAST), threat intelligence (VirusTotal), and AI-powered assessment to help security teams identify malicious behavior and make informed **ALLOW/BLOCK/NEEDS_REVIEW** decisions.

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Security Analysis** | SAST with custom Semgrep rules targeting banking fraud, credential theft, and data exfiltration |
| **Threat Intelligence** | VirusTotal integration for known malware detection |
| **AI-Powered Summaries** | LLM-generated security assessments using OpenAI, WatsonX, or Ollama |
| **Governance Decisioning** | Deterministic policy rules producing ALLOW/BLOCK/NEEDS_REVIEW verdicts |
| **Evidence Bundles** | Complete audit trails linking decisions to code, manifest, and network traces |
| **Multiple Interfaces** | Web UI, REST API, CLI, and Claude Desktop (MCP) integration |

---

## Features

### 🔍 Security Analysis Pipeline
- **Permissions Analysis** — Risk assessment of manifest permissions with sensitive domain detection
- **SAST Engine** — Custom Semgrep rules with MITRE ATT&CK and CWE mappings
- **Entropy Detection** — Identifies obfuscated/packed code
- **VirusTotal Integration** — Cross-references with 70+ antivirus engines
- **Chrome Web Store Metadata** — Extracts ratings, user counts, developer info

### ⚖️ Governance Engine
- **Deterministic Verdicts** — Same extension → same decision, every time
- **Policy Rulepacks** — YAML-based rules for enterprise governance and CWS compliance
- **Evidence Chain** — Every verdict links to specific code snippets and manifest excerpts
- **Enforcement Bundles** — Export complete evidence packages for audit/compliance

### 🎨 Modern Web Interface
- **React + Vite** frontend with real-time scan progress
- **Detailed Results** — Permissions breakdown, SAST findings, governance decisions
- **File Explorer** — Browse and inspect extension source code
- **PDF Reports** — Generate downloadable security reports

---

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# LLM Provider (required for AI summaries)
LLM_PROVIDER=openai  # Options: openai, watsonx, ollama, rits

# OpenAI (if LLM_PROVIDER=openai)
OPENAI_API_KEY=sk-...

# WatsonX (if LLM_PROVIDER=watsonx)
WATSONX_API_KEY=...
WATSONX_API_ENDPOINT=https://...
WATSONX_PROJECT_ID=...

# Ollama (if LLM_PROVIDER=ollama)
OLLAMA_BASE_URL=http://localhost:11434

# VirusTotal (optional, for threat intelligence)
VIRUSTOTAL_API_KEY=...

# CORS (for production deployment)
CORS_ORIGINS=https://your-domain.com
```

### Supported LLM Providers

| Provider | `LLM_PROVIDER` | Recommended Models |
|----------|----------------|-------------------|
| OpenAI | `openai` | `gpt-4o`, `gpt-4-turbo` |
| WatsonX (IBM) | `watsonx` | `meta-llama/llama-3-3-70b-instruct` |
| Ollama (Local) | `ollama` | `llama3`, `mistral` |
| RITS (IBM Research) | `rits` | `meta-llama/llama-3-3-70b-instruct` |

---

## Usage

### Web Interface

1. Start the application (Docker or local development)
2. Open http://localhost:8007 (Docker) or http://localhost:5173 (local)
3. Paste a Chrome Web Store URL or upload a CRX/ZIP file
4. View security analysis and governance decisions

### CLI

```bash
# Analyze from Chrome Web Store URL
make analyze URL=https://chromewebstore.google.com/detail/extension-name/abcdefghijklmnop

# Analyze local file
make analyze-file FILE=/path/to/extension.crx

# Output to JSON file
make analyze URL=<url> OUTPUT=results.json

# Direct command
uv run extension-shield analyze --url <chrome_web_store_url>
uv run extension-shield analyze --file /path/to/extension.crx
```

### Claude Desktop Integration (MCP)

ExtensionShield integrates with Claude Desktop via the Model Context Protocol.

**Setup:**

1. Edit Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ExtensionShield": {
      "command": "uv",
      "args": [
        "--directory",
        "/absolute/path/to/ExtensionShield",
        "run",
        "python",
        "-m",
        "extension_shield.mcp_server.main"
      ]
    }
  }
}
```

2. Restart Claude Desktop
3. Ask Claude: *"Analyze this Chrome extension: https://chromewebstore.google.com/detail/..."*

---

## API Reference

### Scan Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scan/trigger` | POST | Trigger extension scan from URL |
| `/api/scan/upload` | POST | Upload and scan CRX/ZIP file |
| `/api/scan/status/{id}` | GET | Check scan status |
| `/api/scan/results/{id}` | GET | Get complete results |
| `/api/scan/files/{id}` | GET | List extracted files |
| `/api/scan/file/{id}/{path}` | GET | Get file content |
| `/api/scan/report/{id}` | GET | Generate PDF report |
| `/api/scan/enforcement_bundle/{id}` | GET | Download governance evidence bundle |

### Management Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/statistics` | GET | Aggregated scan statistics |
| `/api/history` | GET | Scan history |
| `/api/recent` | GET | Recent scans with summaries |
| `/api/scan/{id}` | DELETE | Delete a scan |
| `/api/clear` | POST | Clear all scans |
| `/health` | GET | Health check |

**Full API documentation:** http://localhost:8007/docs

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ExtensionShield                        │
├─────────────────────────────────────────────────────────────┤
│  Interfaces                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │   CLI   │  │ Web UI  │  │   API   │  │   MCP   │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       └────────────┴────────────┴────────────┘             │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────┐           │
│  │         LangGraph Workflow Pipeline         │           │
│  │  Ingest → Parse → Analyze → Govern → Report │           │
│  └──────────────────────┬──────────────────────┘           │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────┐           │
│  │              Security Analyzers             │           │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────┐ │           │
│  │  │Permissions │ │   SAST     │ │ WebStore │ │           │
│  │  └────────────┘ └────────────┘ └──────────┘ │           │
│  │  ┌────────────┐ ┌────────────┐              │           │
│  │  │VirusTotal  │ │  Entropy   │              │           │
│  │  └────────────┘ └────────────┘              │           │
│  └──────────────────────┬──────────────────────┘           │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────┐           │
│  │          Governance Engine (DSL)            │           │
│  │  Facts → Signals → Rules → Decision         │           │
│  └──────────────────────┬──────────────────────┘           │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────┐           │
│  │       LLM Summary Generation                │           │
│  │    (OpenAI / WatsonX / Ollama)              │           │
│  └─────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### Custom Semgrep Rules

Located in `src/extension_shield/config/custom_semgrep_rules.yaml`:

| Rule ID | Category | Description |
|---------|----------|-------------|
| `banking.form_hijack.submit_intercept` | Form hijacking | Form submit interception |
| `banking.cred_sniff.password_input_hooks` | Credential theft | Password field listeners |
| `banking.ext.webrequest.redirect` | Network hijacking | WebRequest redirect abuse |
| `banking.exfil.generic_channels` | Data exfiltration | sendBeacon/Image.src abuse |
| `banking.obfuscation.eval_newfunc` | Code injection | eval()/Function() execution |

All rules include MITRE ATT&CK mappings and CWE references.

### Governance Rulepacks

| Rulepack | Description |
|----------|-------------|
| `ENTERPRISE_GOV_BASELINE` | Enterprise governance baseline (host permissions, data transfer, sensitive APIs) |
| `CWS_LIMITED_USE` | Chrome Web Store Limited Use policy alignment |

---

## Project Structure

```
ExtensionShield/
├── src/extension_shield/
│   ├── api/              # FastAPI REST endpoints
│   ├── cli/              # Click CLI commands
│   ├── core/
│   │   └── analyzers/    # Security analyzers (SAST, VT, etc.)
│   ├── governance/       # Governance engine (facts, rules, DSL)
│   ├── llm/              # LLM integration (prompts, providers)
│   ├── mcp_server/       # Claude Desktop MCP integration
│   └── workflow/         # LangGraph workflow orchestration
├── frontend/             # React + Vite web UI
├── docs/                 # Technical documentation
├── tests/                # Test suite
└── contracts/            # API and data contracts
```

---

## Deployment

### Railway

```bash
# Link project (first time)
make deploy-link

# Deploy
make deploy

# View logs
make deploy-logs
```

### Docker Production

```bash
# Use production environment template
cp env.production.template .env
# Configure .env with production values

# Build and deploy
docker compose -f docker-compose.yml up -d
```

---

## Related Documentation

- **[GOVERNANCE_ARCHITECTURE_AND_HLD.md](./GOVERNANCE_ARCHITECTURE_AND_HLD.md)** — Complete architecture, data contracts, and implementation details
- **[../AGENTS.md](../AGENTS.md)** — Agent/AI coding guidelines for this repository

