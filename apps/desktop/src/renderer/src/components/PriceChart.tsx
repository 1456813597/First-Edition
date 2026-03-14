import { CandlestickSeries, createChart, HistogramSeries, LineSeries, type CandlestickData, type HistogramData } from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { KlineSeries } from "@stockdesk/shared";
import styles from "./PriceChart.module.css";

function toUnix(time: string) {
  return Math.floor(new Date(time).getTime() / 1000);
}

function addCandlestickSeries(chart: any, options: Record<string, unknown>) {
  if (typeof chart.addCandlestickSeries === "function") {
    return chart.addCandlestickSeries(options);
  }
  return chart.addSeries(CandlestickSeries, options);
}

function addHistogramSeries(chart: any, options: Record<string, unknown>) {
  if (typeof chart.addHistogramSeries === "function") {
    return chart.addHistogramSeries(options);
  }
  return chart.addSeries(HistogramSeries, options);
}

function addLineSeries(chart: any, options: Record<string, unknown>) {
  if (typeof chart.addLineSeries === "function") {
    return chart.addLineSeries(options);
  }
  return chart.addSeries(LineSeries, options);
}

export function PriceChart(props: { series: KlineSeries | undefined; loading?: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const candleRef = useRef<any>(null);
  const volumeRef = useRef<any>(null);
  const ma5Ref = useRef<any>(null);
  const ma10Ref = useRef<any>(null);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const chart: any = createChart(hostRef.current, {
      layout: {
        background: { color: "#09131f" },
        textColor: "#b7c8db"
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" }
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
      timeScale: { borderColor: "rgba(255,255,255,0.1)" },
      width: hostRef.current.clientWidth,
      height: 420
    });

    chartRef.current = chart;
    candleRef.current = addCandlestickSeries(chart, {
      upColor: "#ec5f67",
      downColor: "#2cb67d",
      wickUpColor: "#ec5f67",
      wickDownColor: "#2cb67d",
      borderVisible: false
    });
    volumeRef.current = addHistogramSeries(chart, {
      priceFormat: { type: "volume" },
      priceScaleId: ""
    });
    ma5Ref.current = addLineSeries(chart, { color: "#f6c945", lineWidth: 2 });
    ma10Ref.current = addLineSeries(chart, { color: "#66c7f4", lineWidth: 2 });

    const resize = () => chart.applyOptions({ width: hostRef.current?.clientWidth ?? 900 });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (chartRef.current) {
        chartRef.current.remove();
      }
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      ma5Ref.current = null;
      ma10Ref.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !candleRef.current || !volumeRef.current || !ma5Ref.current || !ma10Ref.current) {
      return;
    }

    if (!props.series) {
      candleRef.current.setData([]);
      volumeRef.current.setData([]);
      ma5Ref.current.setData([]);
      ma10Ref.current.setData([]);
      return;
    }

    candleRef.current.setData(
      props.series.bars.map(
        (bar) =>
          ({
            time: toUnix(bar.time) as any,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close
          }) satisfies CandlestickData
      )
    );
    volumeRef.current.setData(
      props.series.bars.map(
        (bar) =>
          ({
            time: toUnix(bar.time) as any,
            value: bar.volume,
            color: bar.close >= bar.open ? "#ec5f6788" : "#2cb67d88"
          }) satisfies HistogramData
      )
    );

    const ma5 = props.series.indicators?.MA5;
    const ma10 = props.series.indicators?.MA10;
    ma5Ref.current.setData(
      (ma5 ?? []).filter((item) => item.value !== null).map((item) => ({ time: toUnix(item.time) as any, value: item.value as number }))
    );
    ma10Ref.current.setData(
      (ma10 ?? []).filter((item) => item.value !== null).map((item) => ({ time: toUnix(item.time) as any, value: item.value as number }))
    );
    chartRef.current.timeScale().fitContent();
  }, [props.series]);

  return (
    <div className={styles.wrap}>
      {props.loading ? <div className={styles.loading}>Loading chart...</div> : null}
      {!props.loading && (!props.series || props.series.bars.length === 0) ? <div className={styles.empty}>暂无 K 线数据</div> : null}
      <div ref={hostRef} className={styles.chart} />
    </div>
  );
}
