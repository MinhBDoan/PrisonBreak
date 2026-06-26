import { ActiveAdaptationSchema, type ActiveAdaptation } from "../../../shared/contracts";
import { AdaptationDecisionSchema, type AdaptationDecision } from "../../../shared/adaptations";
import type { ServiceDatabase } from "../db";

interface AdaptationRow {
  config_json: string;
}

export class AdaptationRepository {
  constructor(private readonly database: ServiceDatabase) {}

  listActive(): ActiveAdaptation[] {
    const rows = this.database
      .prepare("SELECT config_json FROM adaptations ORDER BY id ASC")
      .all() as AdaptationRow[];
    const latestByActionAndTarget = new Map<string, ActiveAdaptation>();

    for (const row of rows) {
      const adaptation = ActiveAdaptationSchema.parse(JSON.parse(row.config_json));
      latestByActionAndTarget.set(`${adaptation.action}:${adaptation.target}`, adaptation);
    }

    return [...latestByActionAndTarget.values()];
  }

  listDecisionHistory(): AdaptationDecision[] {
    const rows = this.database
      .prepare("SELECT config_json FROM adaptations ORDER BY id ASC")
      .all() as AdaptationRow[];

    return rows.map((row) => {
      const adaptation = ActiveAdaptationSchema.parse(JSON.parse(row.config_json));
      return AdaptationDecisionSchema.parse({
        action: adaptation.action,
        target: adaptation.target,
        rationale: adaptation.rationale,
      });
    });
  }

  storeAccepted(runId: number, decision: AdaptationDecision): ActiveAdaptation {
    const nextLevel =
      this.listActive()
        .filter(
          (adaptation) =>
            adaptation.action === decision.action && adaptation.target === decision.target,
        )
        .at(-1)?.level ?? 0;
    const adaptation: ActiveAdaptation = {
      action: decision.action,
      target: decision.target,
      rationale: decision.rationale,
      level: nextLevel + 1,
    };

    this.database
      .prepare("INSERT INTO adaptations (run_id, action, config_json) VALUES (?, ?, ?)")
      .run(runId, adaptation.action, JSON.stringify(adaptation));

    return adaptation;
  }
}
