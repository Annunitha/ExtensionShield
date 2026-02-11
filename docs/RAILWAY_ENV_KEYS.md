# Railway environment variables (source of truth: project `.env`)

Use these **exact** variable names in Railway. The frontend (Vite) only sees variables that start with `VITE_`, and they are baked in at **build time**.

---

## Why Supabase broke

- The **backend** uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- The **frontend** needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `VITE_SUPABASE_ANON_KEY` is the **anon/public** key from Supabase (safe for the browser). It is **not** the same as `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose to the client).
- If you only copied root `.env` into Railway, you had no `VITE_*` vars, so the frontend build had no Supabase config.

**Fix:** Add the two `VITE_*` vars below. Get the anon key from: [Supabase Dashboard](https://app.supabase.com) → your project → **Settings** → **API** → copy the **anon** / **public** key (not the service_role key).

---

## Copy-paste list for Railway

Set these in Railway (Project or Service → Variables). Values below match your `.env` where present; the one you must fill from Supabase is noted.

### Backend (API / server)

| Variable | Example / note |
|----------|----------------|
| `ENV` | `dev` (or `prod` for production) |
| `PORT` | Railway sets this; optional override `8007` |
| `DB_BACKEND` | `supabase` |
| `SUPABASE_URL` | `https://exmwrsrwhzvxcnhcflwb.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your existing service role key (from .env) |
| `DATABASE_URL` | Your existing Postgres URL (from .env) |
| `LLM_PROVIDER` | `openai` |
| `LLM_MODEL` | `gpt-4o` |
| `LLM_FALLBACK_CHAIN` | `openai,groq` |
| `OPENAI_API_KEY` | Your OpenAI key (from .env) |
| `GROQ_API_KEY` | Your Groq key (from .env) |
| `WATSONX_API_KEY` | (from .env if using WatsonX) |
| `WATSONX_API_ENDPOINT` | `https://us-south.ml.cloud.ibm.com` |
| `WATSONX_PROJECT_ID` | (from .env if using WatsonX) |
| `VIRUSTOTAL_API_KEY` | (from .env if using VirusTotal) |
| `EXTENSION_STORAGE_PATH` | e.g. `/app/extensions_storage` (or Railway volume path) |
| `DATABASE_PATH` | e.g. `/app/data/extension-shield.db` (used if DB_BACKEND were sqlite) |
| `CORS_ORIGINS` | Optional. e.g. `https://your-app.up.railway.app` or `*` |
| `RATE_LIMIT_ENABLED` | Optional. `true` or `false` |
| `CSP_REPORT_ONLY` | Optional. `false` (or `true` for report-only CSP) |

### Frontend (must be set so they exist at build time)

| Variable | Value / note |
|----------|--------------|
| `VITE_SUPABASE_URL` | **Same as SUPABASE_URL:** `https://exmwrsrwhzvxcnhcflwb.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | **From Supabase Dashboard:** Settings → API → **anon** (public) key. Not the service_role key. |

---

## One-line summary

- Backend: keep all your current keys (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, LLM keys, etc.).
- Frontend: add **`VITE_SUPABASE_URL`** (same as `SUPABASE_URL`) and **`VITE_SUPABASE_ANON_KEY`** (anon key from Supabase API settings). Without these two, the frontend build has no Supabase config and you get the “Supabase is not configured” message.

---

## Optional (from .env.example / code)

- `ADMIN_API_KEY`, `TELEMETRY_ADMIN_KEY` – if you use admin/telemetry endpoints  
- `SUPABASE_SCAN_RESULTS_TABLE` – default `scan_results`  
- `SUPABASE_JWT_AUD` – default `authenticated`  
- `LLM_PROVIDER_PRIMARY`, `LLM_TIMEOUT_SECONDS`, `LLM_MAX_RETRIES_PER_PROVIDER`  
- `OLLAMA_BASE_URL`, `RITS_API_BASE_URL`, `RITS_API_KEY` – if using those providers  
- `VITE_API_URL` – only if frontend calls a different API origin (usually leave unset when served by same backend)  
- `VITE_DEBUG_AUTH` – optional frontend auth debugging  
- `VITE_CSP_REPORT_ONLY` – optional CSP report-only  
- `CHROMESTATS_API_KEY`, `CHROMESTATS_API_URL`, `CHROME_VERSION` – if using Chrome stats
