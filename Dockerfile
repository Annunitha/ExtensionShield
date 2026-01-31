# ExtensionShield Dockerfile
# Multi-stage build: Node.js for frontend, Python for backend

# =============================================================================
# Stage 1: Build React Frontend
# =============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files first for better layer caching
COPY frontend/package*.json ./

# Install dependencies with increased memory for production builds
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm ci --silent

# Copy frontend source
COPY frontend/ ./

# Build production bundle
RUN npm run build

# =============================================================================
# Stage 2: Python Backend with Frontend Static Files
# =============================================================================
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1

WORKDIR /app

# Install system dependencies
# - git: required by some Python packages and semgrep
# - curl: for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv package manager
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files and README (required by pyproject.toml)
COPY pyproject.toml uv.lock README.md ./

# Copy application source code (needed for package build)
COPY src/ ./src/

# Install Python dependencies and build the project
RUN uv sync --frozen --no-dev

# Copy frontend build from stage 1
COPY --from=frontend-builder /app/frontend/dist ./static

# Create necessary directories
RUN mkdir -p extensions_storage data

# Set default environment variables
ENV EXTENSION_STORAGE_PATH=/app/extensions_storage \
    DATABASE_PATH=/app/data/extension-shield.db \
    LLM_PROVIDER=openai

# Default port (Railway will override with PORT env var)
ENV PORT=8007

# Expose the API port
EXPOSE 8007

# Health check - uses PORT env var that Railway injects
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8007}/health || exit 1

# Run the application - uses PORT env var for Railway compatibility
CMD ["sh", "-c", "uv run uvicorn extension_shield.api.main:app --host 0.0.0.0 --port ${PORT:-8007}"]
