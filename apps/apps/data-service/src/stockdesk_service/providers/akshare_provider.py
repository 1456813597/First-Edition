from __future__ import annotations

import contextlib
from datetime import UTC, date, datetime, timedelta
import io
import logging
import re
import time

import akshare as ak
import pandas as pd
import requests

from stockdesk_service.models import (
    EventItem,
    FundamentalSnapshot,
    HealthPayload,
    KlineBar,
    KlineSeries,
    NewsItem,
    QuoteSnapshot,
    SymbolSearchResult,
)
from stockdesk_service.utils.symbols import normalize_symbol, split_symbol, to_ak_prefix

COL_CODE = "\u4ee3\u7801"
COL_NAME = "\u540d\u79f0"
COL_LAST = "\u6700\u65b0\u4ef7"
COL_CHANGE_PCT = "\u6da8\u8dcc\u5e45"
COL_TURNOVER = "\u6210\u4ea4\u989d"
COL_TURNOVER_RATE = "\u6362\u624b\u7387"
COL_VOLUME_RATIO = "\u91cf\u6bd4"
COL_HIGH = "\u6700\u9ad8"
COL_LOW = "\u6700\u4f4e"
COL_OPEN = "\u4eca\u5f00"
COL_PREV_CLOSE = "\u6628\u6536"
COL_TIME = "\u65f6\u95f4"
COL_DATE = "\u65e5\u671f"
COL_TITLE = "\u65b0\u95fb\u6807\u9898"
COL_CONTENT = "\u65b0\u95fb\u5185\u5bb9"
COL_SOURCE = "\u6587\u7ae0\u6765\u6e90"
COL_LINK = "\u65b0\u95fb\u94fe\u63a5"
COL_PUBLISHED_AT = "\u53d1\u5e03\u65f6\u95f4"
COL_STOP_TIME = "\u505c\u724c\u65f6\u95f4"
COL_STOP_DATE = "\u505c\u724c\u65e5\u671f"
COL_STOP_REASON = "\u505c\u724c\u539f\u56e0"
COL_STOP_PERIOD = "\u505c\u724c\u671f\u9650"
COL_STOCK_CODE = "\u80a1\u7968\u4ee3\u7801"
COL_STOCK_NAME = "\u80a1\u7968\u7b80\u79f0"
COL_GUIDANCE_REASON = "\u4e1a\u7ee9\u53d8\u52a8\u539f\u56e0\u6458\u8981"
COL_GUIDANCE_TYPE = "\u9884\u544a\u7c7b\u578b"
COL_PRICE_OPEN = "\u5f00\u76d8"
COL_PRICE_CLOSE = "\u6536\u76d8"
COL_PRICE_HIGH = "\u6700\u9ad8"
COL_PRICE_LOW = "\u6700\u4f4e"
COL_VOLUME = "\u6210\u4ea4\u91cf"

logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(tz=UTC).isoformat()


def safe_float(value) -> float | None:
    if value is None or pd.isna(value):
        return None
    return float(value)


def pick_float_from_row(row: pd.Series, keys: list[str]) -> float | None:
    for key in keys:
        if key in row:
            value = safe_float(row.get(key))
            if value is not None:
                return value
    return None


def pick_text_from_row(row: pd.Series, keys: list[str]) -> str | None:
    for key in keys:
        if key in row:
            value = row.get(key)
            if value is None or pd.isna(value):
                continue
            text = str(value).strip()
            if text:
                return text
    return None


def to_utc_iso(value: object) -> str:
    ts = pd.to_datetime(value or datetime.now())
    if ts.tzinfo is None:
        ts = ts.tz_localize("Asia/Shanghai")
    return ts.tz_convert("UTC").isoformat()


def to_compact_date(value: str | None, default: str) -> str:
    return (value or default).replace("-", "")


def resample_kline_frame(df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    if timeframe == "1d":
        return df

    rule = "W-FRI" if timeframe == "1w" else "M"
    frame = df.copy()
    frame["time"] = pd.to_datetime(frame["time"])
    frame = frame.set_index("time")
    frame = frame.resample(rule).agg(
        {
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
            "turnover": "sum",
        }
    )
    frame = frame.dropna(subset=["open", "close"]).reset_index()
    return frame


def with_retry(loader, attempts: int = 2, delay_seconds: float = 0.35):
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            return loader()
        except Exception as error:  # pragma: no cover - exercised in integration runtime
            last_error = error
            if attempt == attempts - 1:
                raise
            time.sleep(delay_seconds * (attempt + 1))

    if last_error is not None:
        raise last_error
    raise RuntimeError("Retry helper finished without result.")


def run_hist_tx_quiet(**kwargs):
    # stock_zh_a_hist_tx prints tqdm progress bars; suppress them in desktop dev logs.
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        return ak.stock_zh_a_hist_tx(**kwargs)


def run_quiet(loader):
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        return loader()


class AkshareProvider:
    provider_id = "akshare"
    provider_name = "AKShare CN-A Provider"
    provider_repo = "https://github.com/akfamily/akshare"

    def health(self) -> HealthPayload:
        return HealthPayload(
            ok=True,
            providerId=self.provider_id,
            providerName=self.provider_name,
            providerRepo=self.provider_repo,
            market="CN_A",
            quoteSource="Sina hq + Eastmoney push2 + AKShare stock_zh_a_spot_em fallback",
            klineSource="AKShare stock_zh_a_hist (Eastmoney) + stock_zh_a_hist_tx fallback",
            newsSource="AKShare stock_news_em + stock_tfp_em + stock_yjyg_em",
        )

    def search_symbols(self, q: str, limit: int = 20) -> list[SymbolSearchResult]:
        df = ak.stock_info_a_code_name()
        keyword = q.strip().upper()
        if keyword:
            mask = df["code"].astype(str).str.contains(keyword, case=False) | df["name"].astype(str).str.contains(keyword, case=False)
            df = df[mask]

        rows: list[SymbolSearchResult] = []
        for _, row in df.head(limit).iterrows():
            normalized = normalize_symbol(str(row["code"]))
            if not normalized:
                continue
            rows.append(SymbolSearchResult(symbol=normalized, name=str(row["name"])))
        return rows

    def _load_spot_dataframe(self) -> tuple[pd.DataFrame | None, str]:
        try:
            df = with_retry(lambda: run_quiet(lambda: ak.stock_zh_a_spot_em()), attempts=2)
            if df.empty:
                return None, "none"
            df[COL_CODE] = df[COL_CODE].astype(str).str.zfill(6)
            return df, "em"
        except Exception as error:
            logger.warning("akshare quote request failed (em): %s", error)
            return None, "none"

    def _fetch_quotes_from_sina(self, symbols: list[str]) -> list[QuoteSnapshot]:
        query_codes: list[str] = []
        code_to_symbol: dict[str, str] = {}
        for symbol in symbols:
            code, exchange = split_symbol(symbol)
            if exchange == "BJ":
                continue
            prefixed = f"{exchange.lower()}{code}"
            query_codes.append(prefixed)
            code_to_symbol[prefixed] = f"{code}.{exchange}"

        if not query_codes:
            return []

        try:
            response = with_retry(
                lambda: requests.get(
                    f"https://hq.sinajs.cn/list={','.join(query_codes)}",
                    timeout=8,
                    headers={
                        "Referer": "https://finance.sina.com.cn",
                        "User-Agent": "Mozilla/5.0",
                    },
                ),
                attempts=2,
            )
            response.raise_for_status()
        except Exception as error:
            logger.warning("sina quote request failed: %s", error)
            return []

        rows: list[QuoteSnapshot] = []
        raw_lines: list[str] = []
        for chunk in response.text.split(";"):
            stripped = chunk.strip()
            if stripped:
                raw_lines.append(f"{stripped};")

        for line in raw_lines:
            matched = re.match(r'^var hq_str_(\w+)="(.*)";$', line.strip())
            if not matched:
                continue
            prefixed = matched.group(1)
            payload = matched.group(2).split(",")
            if len(payload) < 10 or not payload[0]:
                continue

            symbol = code_to_symbol.get(prefixed)
            if not symbol:
                continue
            code, exchange = split_symbol(symbol)

            name = payload[0]
            open_price = safe_float(payload[1])
            prev_close = safe_float(payload[2])
            last = safe_float(payload[3])
            high = safe_float(payload[4])
            low = safe_float(payload[5])
            volume = safe_float(payload[8])
            turnover = safe_float(payload[9])
            if last is None:
                continue

            change_pct = ((last - prev_close) / prev_close * 100) if prev_close else 0.0
            status = "st" if "ST" in name.upper() else "normal"
            if "\u9000" in name:
                status = "delisting"

            updated_at = now_iso()
            if len(payload) > 31 and payload[30] and payload[31]:
                updated_at = to_utc_iso(f"{payload[30]} {payload[31]}")

            rows.append(
                QuoteSnapshot(
                    symbol=f"{code}.{exchange}",
                    name=name,
                    last=last,
                    changePct=change_pct,
                    turnover=turnover,
                    turnoverRate=None,
                    volumeRatio=None,
                    high=high,
                    low=low,
                    open=open_price,
                    prevClose=prev_close,
                    status=status,
                    updatedAt=updated_at,
                )
            )

        return rows

    def _fetch_quotes_from_eastmoney(self, symbols: list[str]) -> list[QuoteSnapshot]:
        secids: list[str] = []
        secid_to_symbol: dict[str, str] = {}
        for symbol in symbols:
            code, exchange = split_symbol(symbol)
            market = "1" if exchange == "SH" else "0"
            secid = f"{market}.{code}"
            secids.append(secid)
            secid_to_symbol[secid] = f"{code}.{exchange}"

        if not secids:
            return []

        try:
            response = with_retry(
                lambda: requests.get(
                    "https://push2.eastmoney.com/api/qt/ulist.np/get",
                    params={
                        "fltt": "2",
                        "invt": "2",
                        "fields": "f13,f12,f14,f2,f3,f6,f15,f16,f17,f18",
                        "secids": ",".join(secids),
                    },
                    timeout=8,
                    headers={
                        "Referer": "https://quote.eastmoney.com/",
                        "User-Agent": "Mozilla/5.0",
                    },
                ),
                attempts=2,
            )
            response.raise_for_status()
            payload = response.json()
        except Exception as error:
            logger.warning("eastmoney quote request failed: %s", error)
            return []

        rows: list[QuoteSnapshot] = []
        diff = payload.get("data", {}).get("diff") or []
        for item in diff:
            code = str(item.get("f12") or "").zfill(6)
            market = str(item.get("f13") or "")
            secid = f"{market}.{code}"
            symbol = secid_to_symbol.get(secid)
            if not symbol:
                continue

            _, exchange = split_symbol(symbol)
            name = str(item.get("f14") or symbol)
            last = safe_float(item.get("f2"))
            if last is None:
                continue

            status = "st" if "ST" in name.upper() else "normal"
            if "\u9000" in name:
                status = "delisting"

            rows.append(
                QuoteSnapshot(
                    symbol=f"{code}.{exchange}",
                    name=name,
                    last=last,
                    changePct=safe_float(item.get("f3")) or 0.0,
                    turnover=safe_float(item.get("f6")),
                    turnoverRate=None,
                    volumeRatio=None,
                    high=safe_float(item.get("f15")),
                    low=safe_float(item.get("f16")),
                    open=safe_float(item.get("f17")),
                    prevClose=safe_float(item.get("f18")),
                    status=status,
                    updatedAt=now_iso(),
                )
            )

        return rows

    def _build_quote_from_hist_tx(self, symbol: str) -> QuoteSnapshot | None:
        code, exchange = split_symbol(symbol)
        try:
            end_date = date.today().isoformat()
            start_date = (date.today() - timedelta(days=20)).isoformat()
            df = with_retry(
                lambda: run_hist_tx_quiet(
                    symbol=to_ak_prefix(symbol),
                    start_date=to_compact_date(start_date, "20200101"),
                    end_date=to_compact_date(end_date, "20500101"),
                    adjust="",
                ),
                attempts=2,
            )
        except Exception as error:
            logger.warning("akshare quote fallback request failed for %s: %s", symbol, error)
            return None

        if df.empty:
            return None

        latest = df.iloc[-1]
        close = float(latest["close"])
        prev_close = float(df.iloc[-2]["close"]) if len(df) > 1 else close
        change_pct = ((close - prev_close) / prev_close * 100) if prev_close else 0.0

        return QuoteSnapshot(
            symbol=f"{code}.{exchange}",
            name=f"{code}.{exchange}",
            last=close,
            changePct=change_pct,
            turnover=safe_float(latest.get("amount")),
            turnoverRate=None,
            volumeRatio=None,
            high=safe_float(latest.get("high")),
            low=safe_float(latest.get("low")),
            open=safe_float(latest.get("open")),
            prevClose=prev_close,
            status="normal",
            updatedAt=to_utc_iso(latest.get("date")),
        )

    def get_quote_realtime(self, symbols: list[str]) -> list[QuoteSnapshot]:
        normalized = [item for item in (normalize_symbol(symbol) for symbol in symbols) if item]
        if not normalized:
            return []

        rows: list[QuoteSnapshot] = []
        rows.extend(self._fetch_quotes_from_sina(normalized))

        resolved = {item.symbol for item in rows}
        pending = [symbol for symbol in normalized if symbol not in resolved]
        if pending:
            rows.extend(self._fetch_quotes_from_eastmoney(pending))

        resolved = {item.symbol for item in rows}
        pending = [symbol for symbol in normalized if symbol not in resolved]
        if pending:
            df, _ = self._load_spot_dataframe()
            if df is not None:
                for symbol in pending:
                    code, exchange = split_symbol(symbol)
                    matched = df[df[COL_CODE] == code]
                    if matched.empty:
                        continue

                    row = matched.iloc[0]
                    name = str(row[COL_NAME])
                    status = "st" if "ST" in name.upper() else "normal"
                    if "\u9000" in name:
                        status = "delisting"

                    rows.append(
                        QuoteSnapshot(
                            symbol=f"{code}.{exchange}",
                            name=name,
                            last=float(row[COL_LAST]),
                            changePct=float(row[COL_CHANGE_PCT]),
                            turnover=safe_float(row.get(COL_TURNOVER)),
                            turnoverRate=safe_float(row.get(COL_TURNOVER_RATE)),
                            volumeRatio=safe_float(row.get(COL_VOLUME_RATIO)),
                            high=safe_float(row.get(COL_HIGH)),
                            low=safe_float(row.get(COL_LOW)),
                            open=safe_float(row.get(COL_OPEN)),
                            prevClose=safe_float(row.get(COL_PREV_CLOSE)),
                            status=status,
                            updatedAt=now_iso(),
                        )
                    )

        resolved = {item.symbol for item in rows}
        for symbol in normalized:
            if symbol in resolved:
                continue
            fallback = self._build_quote_from_hist_tx(symbol)
            if fallback:
                rows.append(fallback)
                resolved.add(symbol)

        return rows

    def get_kline(self, symbol: str, timeframe: str, adjust_mode: str, start: str | None, end: str | None) -> KlineSeries:
        code, exchange = split_symbol(symbol)
        if timeframe == "1m":
            minute_df: pd.DataFrame | None = None
            try:
                minute_df = with_retry(lambda: run_quiet(lambda: ak.stock_zh_a_hist_pre_min_em(symbol=to_ak_prefix(symbol))), attempts=2)
            except Exception as error:
                logger.warning("akshare 1m pre-market request failed for %s: %s", symbol, error)
                try:
                    minute_df = with_retry(lambda: run_quiet(lambda: ak.stock_zh_a_hist_min_em(symbol=code, period="1", adjust="")), attempts=2)
                except Exception as fallback_error:
                    logger.warning("akshare 1m fallback request failed for %s: %s", symbol, fallback_error)
                    minute_df = None

            if minute_df is None or minute_df.empty:
                return KlineSeries(symbol=f"{code}.{exchange}", timeframe="1m", adjustMode="none", bars=[], updatedAt=now_iso())

            minute_df = minute_df.rename(
                columns={
                    COL_TIME: "time",
                    COL_PRICE_OPEN: "open",
                    COL_PRICE_CLOSE: "close",
                    COL_PRICE_HIGH: "high",
                    COL_PRICE_LOW: "low",
                    COL_VOLUME: "volume",
                    COL_TURNOVER: "turnover",
                }
            )
            minute_df["time"] = pd.to_datetime(minute_df["time"])
            for column in ["open", "high", "low", "close", "volume", "turnover"]:
                if column in minute_df.columns:
                    minute_df[column] = pd.to_numeric(minute_df[column], errors="coerce")
            minute_df = minute_df.dropna(subset=["time", "open", "high", "low", "close", "volume"])
            if start:
                minute_df = minute_df[minute_df["time"] >= pd.to_datetime(start)]
            if end:
                minute_df = minute_df[minute_df["time"] <= pd.to_datetime(end)]

            bars = [
                KlineBar(
                    time=to_utc_iso(row["time"]),
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=float(row["volume"]),
                    turnover=safe_float(row.get("turnover")),
                )
                for _, row in minute_df.iterrows()
            ]
            return KlineSeries(symbol=f"{code}.{exchange}", timeframe="1m", adjustMode="none", bars=bars, updatedAt=now_iso())

        period_map = {"1d": "daily", "1w": "weekly", "1M": "monthly"}
        adjust_map = {"qfq": "qfq", "hfq": "hfq", "none": ""}
        daily_df: pd.DataFrame | None = None
        try:
            daily_df = with_retry(
                lambda: run_quiet(
                    lambda: ak.stock_zh_a_hist(
                        symbol=code,
                        period=period_map[timeframe],
                        start_date=to_compact_date(start, "20200101"),
                        end_date=to_compact_date(end, date.today().isoformat()),
                        adjust=adjust_map[adjust_mode],
                    )
                ),
                attempts=2,
            )
            if daily_df.empty:
                raise ValueError("Empty kline frame from stock_zh_a_hist.")
            daily_df = daily_df.rename(
                columns={
                    COL_DATE: "time",
                    COL_PRICE_OPEN: "open",
                    COL_PRICE_CLOSE: "close",
                    COL_PRICE_HIGH: "high",
                    COL_PRICE_LOW: "low",
                    COL_VOLUME: "volume",
                    COL_TURNOVER: "turnover",
                }
            )
        except Exception as error:
            logger.warning("akshare kline request failed for %s: %s", symbol, error)
            try:
                daily_df = with_retry(
                    lambda: run_hist_tx_quiet(
                        symbol=to_ak_prefix(symbol),
                        start_date=to_compact_date(start, "20200101"),
                        end_date=to_compact_date(end, date.today().isoformat()),
                        adjust=adjust_map[adjust_mode],
                    ),
                    attempts=2,
                )
                if daily_df.empty:
                    raise ValueError("Empty kline frame from stock_zh_a_hist_tx.")
                daily_df = daily_df.rename(
                    columns={
                        "date": "time",
                        "open": "open",
                        "close": "close",
                        "high": "high",
                        "low": "low",
                        "amount": "volume",
                    }
                )
                daily_df["turnover"] = daily_df["volume"]
                daily_df = resample_kline_frame(daily_df, timeframe)
            except Exception as fallback_error:
                logger.warning("akshare kline fallback request failed for %s: %s", symbol, fallback_error)
                daily_df = None

        if daily_df is None or daily_df.empty:
            return KlineSeries(symbol=f"{code}.{exchange}", timeframe=timeframe, adjustMode=adjust_mode, bars=[], updatedAt=now_iso())

        daily_df["time"] = pd.to_datetime(daily_df["time"])
        for column in ["open", "high", "low", "close", "volume", "turnover"]:
            if column in daily_df.columns:
                daily_df[column] = pd.to_numeric(daily_df[column], errors="coerce")
        daily_df = daily_df.dropna(subset=["time", "open", "high", "low", "close", "volume"])
        if daily_df.empty:
            return KlineSeries(symbol=f"{code}.{exchange}", timeframe=timeframe, adjustMode=adjust_mode, bars=[], updatedAt=now_iso())

        bars = [
            KlineBar(
                time=to_utc_iso(row["time"]),
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row["volume"]),
                turnover=safe_float(row.get("turnover")),
            )
            for _, row in daily_df.iterrows()
        ]
        return KlineSeries(symbol=f"{code}.{exchange}", timeframe=timeframe, adjustMode=adjust_mode, bars=bars, updatedAt=now_iso())

    def get_news(self, symbol: str, start: str | None, end: str | None, limit: int) -> list[NewsItem]:
        code, exchange = split_symbol(symbol)
        try:
            df = run_quiet(lambda: ak.stock_news_em(symbol=code))
        except Exception as error:
            logger.warning("akshare news request failed for %s: %s", symbol, error)
            return []
        if COL_PUBLISHED_AT in df.columns:
            df[COL_PUBLISHED_AT] = pd.to_datetime(df[COL_PUBLISHED_AT])
            if start:
                df = df[df[COL_PUBLISHED_AT] >= pd.to_datetime(start)]
            if end:
                df = df[df[COL_PUBLISHED_AT] <= pd.to_datetime(end)]

        items: list[NewsItem] = []
        for _, row in df.head(limit).iterrows():
            items.append(
                NewsItem(
                    id=f"news-{code}-{pd.to_datetime(row.get(COL_PUBLISHED_AT) or datetime.now()).value}",
                    symbol=f"{code}.{exchange}",
                    title=str(row.get(COL_TITLE) or row.get("\u6807\u9898") or ""),
                    summary=str(row.get(COL_CONTENT) or row.get("\u5185\u5bb9") or "")[:280],
                    source=str(row.get(COL_SOURCE) or row.get("\u6765\u6e90") or "Eastmoney"),
                    publishedAt=to_utc_iso(row.get(COL_PUBLISHED_AT)),
                    url=str(row.get(COL_LINK)) if row.get(COL_LINK) else None,
                )
            )
        return items

    def get_events(self, symbol: str, start: str | None, end: str | None, limit: int) -> list[EventItem]:
        code, exchange = split_symbol(symbol)
        items: list[EventItem] = []

        try:
            tfp_df = run_quiet(lambda: ak.stock_tfp_em())
            tfp_df[COL_CODE] = tfp_df[COL_CODE].astype(str).str.zfill(6)
            matched = tfp_df[tfp_df[COL_CODE] == code]
            for _, row in matched.head(limit).iterrows():
                occurred = row.get(COL_STOP_TIME) or row.get(COL_STOP_DATE) or datetime.now()
                items.append(
                    EventItem(
                        id=f"halt-{code}-{pd.to_datetime(occurred).value}",
                        symbol=f"{code}.{exchange}",
                        type="suspension",
                        title=f"{row.get(COL_NAME, code)} suspension update",
                        summary=str(row.get(COL_STOP_REASON) or row.get(COL_STOP_PERIOD) or "Suspension status updated"),
                        occurredAt=to_utc_iso(occurred),
                        source="Eastmoney",
                    )
                )
        except Exception:
            pass

        try:
            yjyg_df = run_quiet(lambda: ak.stock_yjyg_em(date=date.today().strftime("%Y%m%d")))
            yjyg_df[COL_STOCK_CODE] = yjyg_df[COL_STOCK_CODE].astype(str).str.zfill(6)
            matched = yjyg_df[yjyg_df[COL_STOCK_CODE] == code]
            for _, row in matched.head(limit).iterrows():
                items.append(
                    EventItem(
                        id=f"earnings-{code}-{row.get(COL_GUIDANCE_REASON, '')[:24]}",
                        symbol=f"{code}.{exchange}",
                        type="earnings_guidance",
                        title=f"{row.get(COL_STOCK_NAME, code)} earnings guidance",
                        summary=str(row.get(COL_GUIDANCE_REASON) or row.get(COL_GUIDANCE_TYPE) or "Earnings guidance"),
                        occurredAt=now_iso(),
                        source="Eastmoney",
                    )
                )
        except Exception:
            pass

        if start or end:
            start_ts = pd.to_datetime(start) if start else None
            end_ts = pd.to_datetime(end) if end else None
            filtered: list[EventItem] = []
            for item in items:
                ts = pd.to_datetime(item.occurredAt)
                if start_ts is not None and ts < start_ts:
                    continue
                if end_ts is not None and ts > end_ts:
                    continue
                filtered.append(item)
            items = filtered

        return items[:limit]

    def get_fundamentals(self, symbol: str) -> FundamentalSnapshot:
        code, exchange = split_symbol(symbol)
        pe_ttm: float | None = None
        pb: float | None = None
        ps_ttm: float | None = None
        total_mv: float | None = None
        circ_mv: float | None = None
        roe: float | None = None
        net_profit_yoy: float | None = None
        revenue_yoy: float | None = None
        report_date: str | None = None

        try:
            valuation_df = run_quiet(lambda: ak.stock_a_lg_indicator(symbol=code))
            if not valuation_df.empty:
                valuation_df = valuation_df.copy()
                if "trade_date" in valuation_df.columns:
                    valuation_df["trade_date"] = pd.to_datetime(valuation_df["trade_date"], errors="coerce")
                    valuation_df = valuation_df.sort_values("trade_date")
                latest = valuation_df.iloc[-1]
                report_date = pick_text_from_row(latest, ["trade_date", "\u65e5\u671f", "date"])
                pe_ttm = pick_float_from_row(latest, ["pe_ttm", "pe", "\u5e02\u76c8\u7387(TTM)", "\u5e02\u76c8\u7387"])
                pb = pick_float_from_row(latest, ["pb", "\u5e02\u51c0\u7387"])
                ps_ttm = pick_float_from_row(latest, ["ps_ttm", "ps", "\u5e02\u9500\u7387(TTM)", "\u5e02\u9500\u7387"])
                total_mv = pick_float_from_row(latest, ["total_mv", "total_market_value", "\u603b\u5e02\u503c"])
                circ_mv = pick_float_from_row(latest, ["circ_mv", "circulating_market_value", "\u6d41\u901a\u5e02\u503c"])
        except Exception as error:
            logger.warning("akshare valuation request failed for %s: %s", symbol, error)

        try:
            financial_df = run_quiet(lambda: ak.stock_financial_analysis_indicator(symbol=code))
            if not financial_df.empty:
                financial_df = financial_df.copy()
                if "\u65e5\u671f" in financial_df.columns:
                    financial_df["\u65e5\u671f"] = pd.to_datetime(financial_df["\u65e5\u671f"], errors="coerce")
                    financial_df = financial_df.sort_values("\u65e5\u671f")
                latest_fin = financial_df.iloc[-1]
                report_date = report_date or pick_text_from_row(latest_fin, ["\u65e5\u671f", "date"])
                roe = pick_float_from_row(latest_fin, ["\u51c0\u8d44\u4ea7\u6536\u76ca\u7387(%)", "ROE"])
                net_profit_yoy = pick_float_from_row(
                    latest_fin,
                    [
                        "\u6263\u9664\u975e\u7ecf\u5e38\u6027\u635f\u76ca\u540e\u7684\u51c0\u5229\u6da6\u540c\u6bd4\u589e\u957f\u7387(%)",
                        "\u51c0\u5229\u6da6\u540c\u6bd4\u589e\u957f\u7387(%)",
                    ],
                )
                revenue_yoy = pick_float_from_row(
                    latest_fin,
                    [
                        "\u8425\u4e1a\u603b\u6536\u5165\u540c\u6bd4\u589e\u957f\u7387(%)",
                        "\u8425\u4e1a\u6536\u5165\u540c\u6bd4\u589e\u957f\u7387(%)",
                    ],
                )
        except Exception as error:
            logger.warning("akshare financial indicator request failed for %s: %s", symbol, error)

        return FundamentalSnapshot(
            symbol=f"{code}.{exchange}",
            peTtm=pe_ttm,
            pb=pb,
            psTtm=ps_ttm,
            totalMarketCap=total_mv,
            circulatingMarketCap=circ_mv,
            roe=roe,
            netProfitYoY=net_profit_yoy,
            revenueYoY=revenue_yoy,
            reportDate=report_date,
            source="akshare",
            updatedAt=now_iso(),
        )



