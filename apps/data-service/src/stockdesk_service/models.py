from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class QuoteRequest(BaseModel):
    symbols: list[str]


class QuoteSnapshot(BaseModel):
    symbol: str
    name: str
    last: float
    changePct: float
    turnover: float | None
    turnoverRate: float | None
    volumeRatio: float | None
    high: float | None
    low: float | None
    open: float | None
    prevClose: float | None
    status: Literal["normal", "halted", "st", "delisting"]
    updatedAt: str


class KlineBar(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    turnover: float | None = None


class KlineSeries(BaseModel):
    symbol: str
    timeframe: Literal["1m", "1d", "1w", "1M"]
    adjustMode: Literal["qfq", "hfq", "none"]
    bars: list[KlineBar]
    updatedAt: str


class NewsItem(BaseModel):
    id: str
    symbol: str
    title: str
    summary: str
    source: str
    publishedAt: str
    url: str | None


class EventItem(BaseModel):
    id: str
    symbol: str
    type: Literal["suspension", "earnings_guidance", "notice", "other"]
    title: str
    summary: str
    occurredAt: str
    source: str


class FundamentalSnapshot(BaseModel):
    symbol: str
    peTtm: float | None
    pb: float | None
    psTtm: float | None
    totalMarketCap: float | None
    circulatingMarketCap: float | None
    roe: float | None
    netProfitYoY: float | None
    revenueYoY: float | None
    reportDate: str | None
    source: str
    updatedAt: str


class SymbolProfile(BaseModel):
    symbol: str
    name: str
    industry: str | None
    board: str | None
    listingDate: str | None
    totalShares: float | None
    circulatingShares: float | None
    totalMarketCap: float | None
    circulatingMarketCap: float | None
    source: str
    updatedAt: str


class LinkageSnapshot(BaseModel):
    kind: Literal["industry", "concept", "index"]
    code: str | None
    name: str
    latest: float | None
    changePct: float | None
    leadingStock: str | None
    leadingStockChangePct: float | None
    upCount: float | None
    downCount: float | None
    turnoverRate: float | None
    totalMarketCap: float | None


class SymbolLinkage(BaseModel):
    symbol: str
    industryBoard: LinkageSnapshot | None
    conceptBoards: list[LinkageSnapshot]
    relatedIndexes: list[LinkageSnapshot]
    updatedAt: str


class SymbolSearchResult(BaseModel):
    symbol: str
    name: str


class HealthPayload(BaseModel):
    ok: bool = True
    providerId: str
    providerName: str
    providerRepo: str | None = None
    market: str = "CN_A"
    quoteSource: str
    klineSource: str
    newsSource: str


class TradingDaysResponse(BaseModel):
    start: str
    end: str
    tradingDays: list[str] = Field(default_factory=list)
