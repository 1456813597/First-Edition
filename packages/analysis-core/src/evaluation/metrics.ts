export interface ForecastEvaluation {
  hitDirection: boolean;
  rangeCovered: boolean;
  mae: number | null;
  mape: number | null;
}

export function evaluateForecast(input: {
  predictedLow: number | null;
  predictedHigh: number | null;
  actualClose: number;
  anchorClose: number;
  stance: "bullish" | "neutral" | "bearish";
}): ForecastEvaluation {
  const actualDirection = input.actualClose > input.anchorClose ? "bullish" : input.actualClose < input.anchorClose ? "bearish" : "neutral";
  const hitDirection = input.stance === actualDirection;
  const rangeCovered =
    input.predictedLow !== null && input.predictedHigh !== null
      ? input.actualClose >= input.predictedLow && input.actualClose <= input.predictedHigh
      : false;
  const mae = Math.abs(input.actualClose - input.anchorClose);
  const mape = input.anchorClose === 0 ? null : (mae / input.anchorClose) * 100;

  return { hitDirection, rangeCovered, mae, mape };
}
