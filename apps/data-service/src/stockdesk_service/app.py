from __future__ import annotations

from datetime import date

from fastapi import FastAPI, Query

from stockdesk_service.models import FundamentalSnapshot, HealthPayload, QuoteRequest, SymbolLinkage, SymbolProfile, TradingDaysResponse
from stockdesk_service.providers.factory import create_provider
from stockdesk_service.utils.calendar import get_trading_days

app = FastAPI(title="StockDesk Local Data Service")
provider = create_provider()


@app.get("/health", response_model=HealthPayload)
def health() -> HealthPayload:
    return provider.health()


@app.get("/symbols/search")
def search_symbols(q: str = Query(default=""), limit: int = Query(default=20, ge=1, le=50)):
    return provider.search_symbols(q, limit)


@app.post("/quotes/realtime")
def quotes_realtime(request: QuoteRequest):
    return provider.get_quote_realtime(request.symbols)


@app.get("/klines/{symbol}")
def kline(
    symbol: str,
    timeframe: str = Query(pattern="^(1m|1d|1w|1M)$"),
    adjust: str = Query(default="qfq", pattern="^(qfq|hfq|none)$"),
    start: str | None = None,
    end: str | None = None,
):
    return provider.get_kline(symbol, timeframe, adjust, start, end)


@app.get("/news/{symbol}")
def news(symbol: str, start: str | None = None, end: str | None = None, limit: int = Query(default=20, ge=1, le=50)):
    return provider.get_news(symbol, start, end, limit)


@app.get("/events/{symbol}")
def events(symbol: str, start: str | None = None, end: str | None = None, limit: int = Query(default=20, ge=1, le=50)):
    return provider.get_events(symbol, start, end, limit)


@app.get("/fundamentals/{symbol}", response_model=FundamentalSnapshot)
def fundamentals(symbol: str):
    return provider.get_fundamentals(symbol)


@app.get("/profile/{symbol}", response_model=SymbolProfile)
def profile(symbol: str):
    return provider.get_symbol_profile(symbol)


@app.get("/linkage/{symbol}", response_model=SymbolLinkage)
def linkage(symbol: str):
    return provider.get_symbol_linkage(symbol)


@app.get("/calendar/trading-days", response_model=TradingDaysResponse)
def trading_days(start: str, end: str):
    start_date = date.fromisoformat(start)
    end_date = date.fromisoformat(end)
    return TradingDaysResponse(start=start, end=end, tradingDays=get_trading_days(start_date, end_date))
