import { gzipSync, gunzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import type { AnalysisReportV2, AnalysisRun, AnalysisRunDetail, AnalysisRunSummary, LegacyAnalysisResultV1 } from "@stockdesk/shared";
import { analysisArtifacts, analysisRuns } from "../schema/tables";
import type { StockdeskDb } from "../database";

export interface AnalysisRunFilter {
  symbol?: string;
  start?: string;
  end?: string;
}

function compress(value: string): Buffer {
  return gzipSync(Buffer.from(value, "utf8"));
}

function decompress(value: Buffer): string {
  return gunzipSync(value).toString("utf8");
}

function normalizeLegacyResult(
  result: AnalysisReportV2 | LegacyAnalysisResultV1,
  symbol: AnalysisRunSummary["symbol"],
  createdAt: string,
  forecastWindow: AnalysisRunSummary["forecastWindow"]
): AnalysisReportV2 {
  if ((result as AnalysisReportV2).schemaVersion === "analysis_report_v2") {
    return result as AnalysisReportV2;
  }

  const legacy = result as LegacyAnalysisResultV1;
  return {
    schemaVersion: "analysis_report_v2",
    symbol,
    asOf: createdAt,
    forecastWindow,
    marketRegime: {
      summary: legacy.confidence.rationale,
      bullets: legacy.summaryLines
    },
    stance: legacy.stance,
    confidence: legacy.confidence,
    summary: legacy.summaryLines,
    technicalView: {
      summary: legacy.summaryLines[0] ?? "",
      bullets: legacy.evidence.filter((item) => item.dimension === "technical").map((item) => item.thesis)
    },
    fundamentalView: {
      summary: legacy.summaryLines[1] ?? "",
      bullets: legacy.evidence.filter((item) => item.dimension === "event").map((item) => item.thesis)
    },
    newsEventView: {
      summary: legacy.summaryLines[2] ?? "",
      bullets: legacy.evidence.filter((item) => item.dimension === "news").map((item) => item.thesis)
    },
    sectorIndexLinkage: {
      industry: null,
      conceptBoards: [],
      indexSnapshot: [],
      interpretation: "历史记录来自旧版 analysis.v1，未包含板块与指数联动结构。"
    },
    scenarioTree: {
      bull: {
        thesis: legacy.summaryLines[0] ?? "",
        probabilityLabel: "旧版未提供",
        triggerSignals: legacy.invalidationSignals.slice(0, 2),
        targetChangePctRange: legacy.targetChangePctRange
      },
      base: {
        thesis: legacy.summaryLines[1] ?? "",
        probabilityLabel: "旧版未提供",
        triggerSignals: legacy.invalidationSignals.slice(0, 2),
        targetChangePctRange: legacy.targetChangePctRange
      },
      bear: {
        thesis: legacy.summaryLines[2] ?? "",
        probabilityLabel: "旧版未提供",
        triggerSignals: legacy.invalidationSignals.slice(0, 2),
        targetChangePctRange: legacy.targetChangePctRange
      }
    },
    riskMatrix: legacy.risks.map((risk) => ({
      level: "medium" as const,
      title: risk,
      detail: risk,
      mitigation: "历史记录来自旧版 analysis.v1，请结合最新数据重新评估。"
    })),
    invalidationSignals: legacy.invalidationSignals,
    actionPlan: {
      observationLevels: legacy.actionPlan.observationLevels,
      entryIdea: "历史记录来自旧版 analysis.v1，未提供明确 entryIdea。",
      stopLossIdea: legacy.actionPlan.stopLossIdea,
      takeProfitIdea: legacy.actionPlan.takeProfitIdea,
      positionSizingIdea: "历史记录来自旧版 analysis.v1，未提供明确仓位建议。",
      disclaimer: "仅供研究参考，不构成投资建议"
    },
    evidence: legacy.evidence.map((item, index) => ({
      id: `legacy-${index + 1}`,
      dimension:
        item.dimension === "technical"
          ? "technical"
          : item.dimension === "data_quality"
            ? "data_quality"
            : "news_event",
      thesis: item.thesis,
      refs: item.featureRefs
    })),
    dataQuality: {
      sufficiency: legacy.dataSufficiency,
      flags: legacy.evidence.filter((item) => item.dimension === "data_quality").map((item) => item.thesis),
      missingPieces: []
    },
    disclaimer: "仅供研究参考，不构成投资建议"
  };
}

export class AnalysisRepo {
  constructor(private readonly db: StockdeskDb) {}

  saveRun(run: AnalysisRun, artifact: { promptRequest: string; rawResponse: string; validationReport: string; llmProfileId: string }) {
    this.db
      .insert(analysisRuns)
      .values({
        id: run.id,
        symbol: run.symbol,
        templateId: run.templateId,
        forecastWindow: run.forecastWindow,
        stance: run.stance,
        confidenceScore: run.confidenceScore,
        summary: run.summary,
        llmProfileId: artifact.llmProfileId,
        createdAt: run.createdAt
      })
      .run();

    this.db
      .insert(analysisArtifacts)
      .values({
        runId: run.id,
        featurePack: compress(JSON.stringify(run.featurePack)),
        promptRequest: compress(artifact.promptRequest),
        rawResponse: compress(artifact.rawResponse),
        parsedResponse: compress(JSON.stringify(run.result)),
        validationReport: compress(artifact.validationReport)
      })
      .run();
  }

  listRuns(filter?: AnalysisRunFilter): AnalysisRunSummary[] {
    const rows = filter?.symbol
      ? this.db.select().from(analysisRuns).where(eq(analysisRuns.symbol, filter.symbol)).all()
      : this.db.select().from(analysisRuns).all();
    return rows
      .filter((row) => {
        if (filter?.start && row.createdAt < filter.start) {
          return false;
        }
        if (filter?.end && row.createdAt > filter.end) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((row) => ({
        id: row.id,
        symbol: row.symbol as AnalysisRunSummary["symbol"],
        templateId: row.templateId as AnalysisRunSummary["templateId"],
        stance: row.stance as AnalysisRunSummary["stance"],
        confidenceScore: row.confidenceScore,
        forecastWindow: row.forecastWindow as AnalysisRunSummary["forecastWindow"],
        createdAt: row.createdAt,
        summary: row.summary
      }));
  }

  listRunDetailsByIds(runIds: string[]): AnalysisRunDetail[] {
    return runIds
      .map((runId) => this.getRun(runId))
      .filter((item): item is AnalysisRunDetail => Boolean(item))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listRecentRunsBySymbol(symbol: string, limit = 5): AnalysisRunSummary[] {
    return this.listRuns({ symbol }).slice(0, limit);
  }

  getRun(id: string): AnalysisRunDetail | null {
    const row = this.db.select().from(analysisRuns).where(eq(analysisRuns.id, id)).get();
    const artifact = this.db.select().from(analysisArtifacts).where(eq(analysisArtifacts.runId, id)).get();
    if (!row || !artifact) {
      return null;
    }

    const parsedResult = JSON.parse(decompress(artifact.parsedResponse)) as AnalysisReportV2 | LegacyAnalysisResultV1;
    const result = normalizeLegacyResult(parsedResult, row.symbol as AnalysisRunDetail["symbol"], row.createdAt, row.forecastWindow as AnalysisRunDetail["forecastWindow"]);
    return {
      id: row.id,
      symbol: row.symbol as AnalysisRunDetail["symbol"],
      templateId: row.templateId as AnalysisRunDetail["templateId"],
      stance: row.stance as AnalysisRunDetail["stance"],
      confidenceScore: row.confidenceScore,
      forecastWindow: row.forecastWindow as AnalysisRunDetail["forecastWindow"],
      createdAt: row.createdAt,
      summary: row.summary,
      result,
      featurePack: JSON.parse(decompress(artifact.featurePack)),
      rawResponse: decompress(artifact.rawResponse),
      promptRequest: decompress(artifact.promptRequest),
      validationReport: decompress(artifact.validationReport)
    };
  }
}
