import type { SymbolId, SymbolSuffix } from "./types/market";

const SH_PREFIXES = ["600", "601", "603", "605", "688", "689", "730", "731", "732", "733", "734", "735", "736", "737", "738", "739"];
const BJ_PREFIXES = ["43", "82", "83", "87", "88", "89", "92"];

export function inferSymbolSuffix(code: string): SymbolSuffix | null {
  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    return null;
  }

  if (SH_PREFIXES.some((prefix) => code.startsWith(prefix))) {
    return "SH";
  }

  if (BJ_PREFIXES.some((prefix) => code.startsWith(prefix))) {
    return "BJ";
  }

  return "SZ";
}

export function normalizeSymbol(input: string): SymbolId | null {
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) {
    return null;
  }

  const dotted = trimmed.match(/^(\d{6})\.(SH|SZ|BJ)$/);
  if (dotted) {
    return `${dotted[1]}.${dotted[2]}` as SymbolId;
  }

  const prefixed = trimmed.match(/^(SH|SZ|BJ)(\d{6})$/);
  if (prefixed) {
    return `${prefixed[2]}.${prefixed[1]}` as SymbolId;
  }

  if (/^\d{6}$/.test(trimmed)) {
    const suffix = inferSymbolSuffix(trimmed);
    return suffix ? (`${trimmed}.${suffix}` as SymbolId) : null;
  }

  return null;
}

export function toProviderSymbol(symbol: SymbolId): string {
  const [code, exchange] = symbol.split(".");
  return exchange === "SH" ? `sh${code}` : exchange === "SZ" ? `sz${code}` : `bj${code}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

