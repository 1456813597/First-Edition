from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path


def load_static_days() -> list[str]:
    data_path = Path(__file__).resolve().parent.parent / "data" / "trading_days_2024_2030.json"
    if not data_path.exists():
        return []
    return json.loads(data_path.read_text(encoding="utf-8"))


def generate_weekday_days(start: date, end: date) -> list[str]:
    days: list[str] = []
    current = start
    while current <= end:
        if current.weekday() < 5:
            days.append(current.isoformat())
        current += timedelta(days=1)
    return days


def get_trading_days(start: date, end: date) -> list[str]:
    static_days = load_static_days()
    if static_days:
        return [item for item in static_days if start.isoformat() <= item <= end.isoformat()]
    return generate_weekday_days(start, end)

