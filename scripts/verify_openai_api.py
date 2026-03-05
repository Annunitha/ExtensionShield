#!/usr/bin/env python3
"""
Verify OpenAI API key and connectivity.

Loads OPENAI_API_KEY from .env (or environment), validates format,
and performs a minimal chat completion to confirm the key works.

Usage:
  uv run python scripts/verify_openai_api.py
  # Or with key from env:
  OPENAI_API_KEY=sk-proj-... uv run python scripts/verify_openai_api.py
"""

import os
import sys

# Load .env from project root (parent of scripts/)
_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_env = os.path.join(_root, ".env")
if os.path.isfile(_env):
    from dotenv import load_dotenv
    load_dotenv(_env)

def main():
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        print("OPENAI_API_KEY is not set. Set it in .env or export OPENAI_API_KEY=...", file=sys.stderr)
        sys.exit(1)
    if not (key.startswith("sk-") or key.startswith("sk-proj-")):
        print("Invalid key format: OpenAI keys must start with 'sk-' or 'sk-proj-'", file=sys.stderr)
        sys.exit(1)
    print("OPENAI_API_KEY is set (format ok). Testing API call...")

    try:
        from extension_shield.llm.clients import get_chat_llm_client
        from extension_shield.llm.clients.provider_type import LLMProviderType
        from langchain_core.messages import HumanMessage
    except ImportError as e:
        print(f"Import error: {e}. Run from project root with: uv run python scripts/verify_openai_api.py", file=sys.stderr)
        sys.exit(1)

    model = os.getenv("LLM_MODEL", "gpt-4o")
    try:
        llm = get_chat_llm_client(
            model_name=model,
            provider_override=LLMProviderType.OPENAI,
        )
        response = llm.invoke([HumanMessage(content="Reply with exactly: OK")])
        text = getattr(response, "content", None) or str(response)
        print(f"OpenAI API OK. Model={model}. Response: {text[:200]}")
        return 0
    except Exception as e:
        print(f"OpenAI API error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    sys.exit(main())
