<h1 align="center">ExtensionShield</h1>

<p align="center">
  <strong>Enterprise Chrome Extension Security & Governance Platform</strong>
</p>

**Security Policy**: See [SECURITY.md](SECURITY.md)

---

## Quick Start

### Docker (Recommended)

```bash
# 1. Clone the repository (replace <your-org> with your GitHub org or username)
git clone https://github.com/<your-org>/ExtensionShield.git
cd ExtensionShield

# 2. Configure environment
cp env.production.template .env
# Edit .env and add your OPENAI_API_KEY (required)

# 3. Build and run
docker compose up --build

# 4. Access the application
# → http://localhost:8007
```

### Local Development

```bash
# Install dependencies
make install                    # Python (uv sync)
cd frontend && npm install      # Frontend

# Configure frontend environment (for authentication)
cd frontend
# Create .env file with your Supabase credentials:
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key
# Get these from: https://app.supabase.com/project/_/settings/api

# Start servers (two terminals)
make api                        # Terminal 1: API at http://localhost:8007
make frontend                   # Terminal 2: UI at http://localhost:5173
```

**Port 8007 vs 5173**: With only `make api`, port 8007 serves the API; the browser will show a short message and a link to the app. **Use http://localhost:5173** (after `make frontend`) to use the app with hot-reload and see the latest frontend changes. To serve the full app from port 8007 (production-like), run `make build-and-serve` once to build the frontend into `static/`, then the API will serve it.

**Note**: If you see `placeholder.supabase.co` errors when trying to log in, you need to configure the frontend environment variables. See [Frontend Configuration](#frontend-configuration) below.

---

## Frontend Configuration

For authentication to work, you need to configure Supabase environment variables in the frontend:

1. **Get your Supabase credentials**:
   - Go to https://app.supabase.com
   - Select your project from the dashboard
   - Click **Settings** (gear icon) in the left sidebar
   - Click **API** under Project Settings
   - Copy the **Project URL** (e.g., `https://xxxxx.supabase.co`) → this is your `VITE_SUPABASE_URL`
   - Copy the **anon** or **public** key from the "Project API keys" section → this is your `VITE_SUPABASE_ANON_KEY`

2. **Create a `.env` file in the `frontend/` directory**:
   ```bash
   cd frontend
   cat > .env << EOF
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   EOF
   ```

3. **Restart the frontend dev server** for changes to take effect.

**Important**: The `VITE_` prefix is required for Vite to expose these variables to the frontend code.

---

## Make Commands

```bash
make help           # Show all commands
make api            # Start API server
make frontend       # Start React dev server
make analyze URL=   # Analyze extension from URL
make test           # Run tests
make format         # Format code
make lint           # Lint code
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/SECURITY.md](docs/SECURITY.md) | Security: reporting vulnerabilities and secrets |
| [docs/AUTH_SESSION_TIMEOUT.md](docs/AUTH_SESSION_TIMEOUT.md) | Configure 30-minute (or other) sign-out in Supabase |
| [docs/SOFTWARE_DOCUMENTATION.md](docs/SOFTWARE_DOCUMENTATION.md) | Stack, structure, workflows, configuration |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | High-level architecture |
| [scripts/run_supabase_migrations.py](scripts/run_supabase_migrations.py) | Apply Supabase SQL migrations with tracking |
| http://localhost:8007/docs | Interactive API documentation (when running) |

---

## Acknowledgments

**Note**: ExtensionShield is an audit/compliance-focused scanner, and we intentionally chose not to reinvent the security foundation from scratch. Instead, we started from the excellent ThreatXtension **[ThreatXtension](https://github.com/barvhaim/ThreatXtension)** project and built on top of it—reworking the frontend, extending the engine, and adding compliance- and evidence-oriented layers.
This is a work in progress—thanks for your patience! For questions or issues, open a GitHub issue or contact **support@extensionshield.com**.


## License

MIT License — see [LICENSE](LICENSE) for details.
