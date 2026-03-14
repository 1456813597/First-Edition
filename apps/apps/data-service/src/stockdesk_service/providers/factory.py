from __future__ import annotations

import os

from stockdesk_service.providers.akshare_provider import AkshareProvider


def create_provider():
    provider = (os.getenv("STOCKDESK_CN_PROVIDER") or "akshare").strip().lower()
    if provider in {"", "akshare"}:
        return AkshareProvider()
    raise RuntimeError(f"Unsupported provider '{provider}'. Supported: akshare")


