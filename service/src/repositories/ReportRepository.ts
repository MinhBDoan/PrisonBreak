import {
  CompleteRunResponseSchema,
  IntelligenceReportSchema,
  type CompleteRunResponse,
  type IntelligenceReport,
} from "../../../shared/contracts";
import type { ServiceDatabase } from "../db";

interface ReportRow {
  report_json: string;
}

export class ReportRepository {
  constructor(private readonly database: ServiceDatabase) {}

  store(runId: number, response: CompleteRunResponse): CompleteRunResponse {
    const parsedResponse = CompleteRunResponseSchema.parse(response);
    this.database
      .prepare("INSERT INTO reports (run_id, report_json) VALUES (?, ?)")
      .run(runId, JSON.stringify(parsedResponse));
    return parsedResponse;
  }

  findLatestCompletion(runId: number): CompleteRunResponse | null {
    const row = this.database
      .prepare("SELECT report_json FROM reports WHERE run_id = ? ORDER BY id DESC LIMIT 1")
      .get(runId) as ReportRow | undefined;
    if (!row) return null;
    const parsed = JSON.parse(row.report_json);
    const completion = CompleteRunResponseSchema.safeParse(parsed);
    if (completion.success) return completion.data;
    return null;
  }

  findLatestReport(runId: number): IntelligenceReport | null {
    const completion = this.findLatestCompletion(runId);
    if (completion) return completion.report;

    const row = this.database
      .prepare("SELECT report_json FROM reports WHERE run_id = ? ORDER BY id DESC LIMIT 1")
      .get(runId) as ReportRow | undefined;
    if (!row) return null;
    return IntelligenceReportSchema.parse(JSON.parse(row.report_json));
  }
}
