import { defineTool } from "eve/tools";
import { z } from "zod";
import { query } from "../lib/db";
import { withEnvelope } from "../lib/envelope";
import { fetchIsq, isBuyerSpec } from "../lib/isq";
import { redact } from "../lib/redact";

// Same tables, order and fallback as fetchOfferDetails in leap-models-go BlQualityRepo.go.
const OFFER_SQL = `
SELECT eo.source_table, eo.eto_ofr_title AS title, eo.eto_ofr_desc AS description,
       eo.fk_glusr_usr_id AS glusr_id, eo.fk_glcat_mcat_id AS mcat_id, m.glcat_mcat_name AS mcat_name,
       eo.eto_ofr_approv AS approval_flag, eo.eto_ofr_approv_date_orig AS approved_at
FROM (
  SELECT 'ETO_OFR' AS source_table, eto_ofr_title, eto_ofr_desc, fk_glusr_usr_id, fk_glcat_mcat_id,
         eto_ofr_approv, eto_ofr_approv_date_orig
  FROM eto_ofr WHERE eto_ofr_display_id = $1
  UNION ALL
  SELECT 'ETO_OFR_EXPIRED', eto_ofr_title, eto_ofr_desc, fk_glusr_usr_id, fk_glcat_mcat_id,
         eto_ofr_approv, eto_ofr_approv_date_orig
  FROM eto_ofr_expired WHERE eto_ofr_display_id = $1
  UNION ALL
  SELECT 'ETO_OFR_TEMP_DEL', eto_ofr_title, eto_ofr_desc, fk_glusr_usr_id, fk_glcat_mcat_id,
         eto_ofr_approv, eto_ofr_approv_date_orig
  FROM eto_ofr_temp_del WHERE eto_ofr_display_id = $1
) eo
LEFT JOIN glcat_mcat m ON m.glcat_mcat_id = eo.fk_glcat_mcat_id
LIMIT 1`;

const PENDING_SQL = `
SELECT 'DIR_QUERY_FREE' AS source_table, d.subject AS title, d.message AS description,
       d.fk_glusr_usr_id AS glusr_id, d.dir_query_mcatid AS mcat_id, m.glcat_mcat_name AS mcat_name,
       'W' AS approval_flag, NULL AS approved_at, d.date_r AS posted_at, d.query_reference_url AS reference_url
FROM dir_query_free d
LEFT JOIN glcat_mcat m ON m.glcat_mcat_id = d.dir_query_mcatid
WHERE d.eto_ofr_display_id = $1
LIMIT 1`;

const STATUS: Record<string, string> = { A: "APPROVED", W: "WAITING" };

export default defineTool({
  description:
    "Fetch the current Buyer Lead by display ID: title, description, buyer GLID, prime MCAT, approval status and the buyer's ISQ answers " +
    "(including quantity/unit). Reads ETO_OFR, ETO_OFR_EXPIRED, ETO_OFR_TEMP_DEL, then DIR_QUERY_FREE for leads not yet approved, " +
    "and the getisq service. Call this first in every audit; its glusr_id and mcat_id feed the other tools.",
  inputSchema: z.object({ bl_id: z.number().int().positive().describe("ETO_OFR display ID") }),
  label: { start: ({ bl_id }) => `Fetch BL ${bl_id}` },
  async execute({ bl_id }, ctx) {
    return withEnvelope("get_current_bl", bl_id, ["imbuyrecR", "getisq"], async ({ partial, warn }) => {
      let rows = await query("PG_IMBUYREC_R_URL", OFFER_SQL, [bl_id]);
      if (rows.length === 0) rows = await query("PG_IMBUYREC_R_URL", PENDING_SQL, [bl_id]);
      if (rows.length === 0) return { records: [] };
      const bl = rows[0];

      let specs: Awaited<ReturnType<typeof fetchIsq>> = [];
      try {
        specs = await fetchIsq(Number(bl.mcat_id) || null, bl_id, ctx.abortSignal);
      } catch (err) {
        partial(`ISQ answers unavailable: ${(err as Error).message}`);
      }
      const answered = specs.filter((s) => s.answer);
      const quantity = answered.find((s) => s.question === "Quantity")?.answer ?? null;
      const quantityUnit = answered.find((s) => s.question === "Quantity Unit")?.answer ?? null;
      const buyerFilled = answered.find((s) => s.question.toLowerCase() === "buyer filled details")?.answer ?? null;
      if (bl.source_table === "ETO_OFR_TEMP_DEL") warn("This BL is in ETO_OFR_TEMP_DEL (deleted/rejected).");

      return {
        dataAsOf: bl.approved_at ? new Date(String(bl.approved_at)).toISOString() : null,
        records: [
          redact({
            bl_id,
            source_table: bl.source_table,
            status: STATUS[String(bl.approval_flag)] ?? String(bl.approval_flag ?? "UNKNOWN"),
            approved_at: bl.approved_at ?? null,
            glusr_id: Number(bl.glusr_id) || null,
            mcat_id: Number(bl.mcat_id) || null,
            mcat_name: bl.mcat_name ?? null,
            title: bl.title ?? "",
            description: bl.description ?? "",
            quantity,
            quantity_unit: quantityUnit,
            buyer_filled_detail: buyerFilled,
            specs: answered
              .filter((s) => s.question !== "Quantity" && s.question !== "Quantity Unit" && isBuyerSpec(s))
              .map((s) => ({ spec_id: s.spec_id, question: s.question, answer: s.answer })),
            other_isq_answers: answered
              .filter((s) => !isBuyerSpec(s) && s.question.toLowerCase() !== "buyer filled details")
              .map((s) => ({ question: s.question, answer: s.answer })),
          }),
        ],
      };
    });
  },
});
