from __future__ import annotations

import re


SH_PREFIXES = ("600", "601", "603", "605", "688", "689", "730", "731", "732", "733", "734", "735", "736", "737", "738", "739")
BJ_PREFIXES = ("43", "82", "83", "87", "88", "89", "92")


def infer_suffix(code: str) -> str | None:
    if not re.fullmatch(r"\d{6}", code):
        return None
    if code.startswith(SH_PREFIXES):
        return "SH"
    if code.startswith(BJ_PREFIXES):
        return "BJ"
    return "SZ"


def normalize_symbol(value: str) -> str | None:
    upper = value.strip().upper()
    if not upper:
        return None

    dotted = re.fullmatch(r"(\d{6})\.(SH|SZ|BJ)", upper)
    if dotted:
        return f"{dotted.group(1)}.{dotted.group(2)}"

    prefixed = re.fullmatch(r"(SH|SZ|BJ)(\d{6})", upper)
    if prefixed:
        return f"{prefixed.group(2)}.{prefixed.group(1)}"

    if re.fullmatch(r"\d{6}", upper):
        suffix = infer_suffix(upper)
        return f"{upper}.{suffix}" if suffix else None

    return None


def split_symbol(symbol: str) -> tuple[str, str]:
    normalized = normalize_symbol(symbol)
    if not normalized:
        raise ValueError(f"Invalid symbol: {symbol}")
    code, exchange = normalized.split(".")
    return code, exchange


def to_ak_prefix(symbol: str) -> str:
    code, exchange = split_symbol(symbol)
    if exchange == "SH":
        return f"sh{code}"
    if exchange == "SZ":
        return f"sz{code}"
    return f"bj{code}"
