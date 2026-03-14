import type { SymbolId } from "./market";

export type AlertRuleType =
  | "price_above"
  | "price_below"
  | "price_below_ma20"
  | "volume_breakout"
  | "limit_up_open";

export interface AlertRule {
  id: string;
  symbol: SymbolId;
  type: AlertRuleType;
  name: string;
  enabled: boolean;
  params: Record<string, string | number | boolean | null>;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  symbol: SymbolId;
  type: AlertRuleType;
  title: string;
  message: string;
  context: Record<string, string | number | boolean | null>;
  triggeredAt: string;
  readAt: string | null;
}
