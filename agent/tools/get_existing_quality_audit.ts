import { defineTool } from "eve/tools";
import { z } from "zod";
import { query } from "../lib/db";
import { withEnvelope } from "../lib/envelope";
import { redact } from "../lib/redact";

const FLAG_NAMES: Record<number, string> = {
  1: "Spec-title mismatch",
  2: "One-word title",
  3: "Absurd quantity",
  4: "PII",
  5: "Selling intent",
  6: "Description correction",
  7: "Buyer Filled Details validity",
  8: "Should fill BFD",
};

// Postgres keeps about 7 days; older rows are only in the lakehouse copy leapml.leap_blml_agent_audit_log.
const SQL = `
SELECT issue_flag_id, attribute_name, attribute_value_before_approval AS before_value,
       attribute_value_after_approval AS after_value, offer_approve_date AS logged_at
FROM leap_blml_agent_audit_log
WHERE fk_eto_ofr_id = $1
ORDER BY offer_approve_date`;

export default defineTool({
  description:
    "Read what the existing BL Quality Agent already changed or flagged on a BL, from leap_blml_agent_audit_log (postgreML). " +
    "Each row is one applied change with its issue flag ID and before/after value. Covers roughly the last 7 days only; " +
    "NOT_FOUND for an older BL does not mean no changes were made.",
  inputSchema: z.object({ bl_id: z.number().int().positive() }),
  label: { start: ({ bl_id }) => `Read quality-agent audit log for BL ${bl_id}` },
  async execute({ bl_id }) {
    return withEnvelope("get_existing_quality_audit", bl_id, ["postgreML:leap_blml_agent_audit_log"], async () => {
      const rows = await query("PG_LEAP_ML_URL", SQL, [bl_id]);
      return {
        records: rows.map((r) =>
          redact({
            issue_flag_id: Number(r.issue_flag_id),
            check: FLAG_NAMES[Number(r.issue_flag_id)] ?? "unknown",
            attribute: r.attribute_name || null,
            before: r.before_value || null,
            after: r.after_value || null,
            logged_at: r.logged_at,
          }),
        ),
      };
    });
  },
});
