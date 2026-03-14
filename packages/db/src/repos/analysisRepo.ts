import { gzipSync, gunzipSync } from "node:zlib";
import { eq } from "drizzle-orm";
import type { AnalysisRun, AnalysisRunDetail, AnalysisRunSummary } from "@stockdesk/shared";
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

  getRun(id: string): AnalysisRunDetail | null {
    const row = this.db.select().from(analysisRuns).where(eq(analysisRuns.id, id)).get();
    const artifact = this.db.select().from(analysisArtifacts).where(eq(analysisArtifacts.runId, id)).get();
    if (!row || !artifact) {
      return null;
    }

    const result = JSON.parse(decompress(artifact.parsedResponse));
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
