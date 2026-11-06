import { defineTool } from "eve/tools";
import { z } from "zod";

// Issue flag IDs from QualityAgentIssueID in leap-go-workers (leadApprovalPostgresFunc.go).
const CHECKS = [
  { key: "spec_title", flagId: 1, name: "Spec-title mismatch", issue: "mismatch_found", skipped: "spec_title_skipped" },
  { key: "one_word", flagId: 2, name: "One-word title", issue: "one_word_issue", skipped: "one_word_skipped" },
  { key: "absurd_quantity", flagId: 3, name: "Absurd quantity", issue: "absurd_qty_issue", skipped: "absurd_qty_skipped" },
  { key: "pii", flagId: 4, name: "PII", issue: "pii", skipped: "pii_skipped" },
  { key: "selling_intent", flagId: 5, name: "Selling intent", issue: "selling_intent_issue", skipped: "selling_intent_skipped" },
  { key: "description_correction", flagId: 6, name: "Description correction", issue: "description_issue", skipped: "description_correction_skipped" },
  { key: "buyer_filled_details", flagId: 7, name: "Buyer Filled Details validity", issue: null, skipped: "skipped" },
] as const;

const PII_PATTERN =
  /(\+91[\s-]?)?[6-9]\d{9}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\b\d{2}[a-z]{5}\d{4}[a-z][a-z0-9]z[a-z0-9]\b/gi;

function redact(value: unknown): unknown {
  if (typeof value === "string") return value.replace(PII_PATTERN, "[redacted]");
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  }
  return value;
}

export default defineTool({
  description:
    "Run the existing LEAP BL Quality Agent (POST /bl_quality) on a Buyer Lead and return each check's result with its issue flag ID. " +
    "Read-only: the service only returns findings and suggested values; it does not change the lead. " +
    "A check marked 'failed' means its result is unknown, not that the lead is clean.",
  inputSchema: z.object({
    display_id: z.string().describe("BL display ID"),
    title: z.string(),
    description: z.string().default(""),
    mcat_name: z.string().default("").describe("Primary MCAT name"),
    category: z.string().default("").describe("Category name of the MCAT"),
    isq_asked: z.array(z.string()).default([]).describe("ISQ question labels, excluding Quantity and Quantity Unit"),
    isq_filled: z.array(z.string()).default([]).describe("ISQ answers, same order as isq_asked"),
    quantity: z.number().default(0),
    quantity_unit: z.string().default(""),
    buyer_filled_detail: z.string().default("").describe("Free-text 'Buyer Filled Details' ISQ answer"),
    gst_flag: z.number().int().min(0).max(1).default(0),
    company_name_flag: z.number().int().min(0).max(1).default(0),
    product_prices: z.array(z.string()).default([]).describe("Prices of products the buyer viewed, e.g. '₹ 200 / Kg'"),
  }),
  label: {
    start: ({ display_id }) => `Run existing quality checks on BL ${display_id}`,
  },
  async execute(input, ctx) {
    const url = process.env.BL_QUALITY_API_URL;
    if (!url) {
      throw new Error("BL_QUALITY_API_URL is not set, so the existing checks could not run. Report every existing check as failed.");
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatInput: "Start",
        ...input,
        product: input.mcat_name,
      }),
      signal: AbortSignal.any([ctx.abortSignal, AbortSignal.timeout(30_000)]),
    });
    if (!response.ok) {
      throw new Error(
        `/bl_quality returned HTTP ${response.status}. Report every existing check as failed and recommend MANUAL_REVIEW.`,
      );
    }

    const body = (await response.json()) as { output?: Record<string, Record<string, unknown>> };
    const output = body.output ?? {};

    const checks = CHECKS.map((check) => {
      const result = output[check.key];
      if (!result) return { flag_id: check.flagId, check: check.name, status: "failed", detail: "no result returned" };

      const skipped = result[check.skipped] === true;
      let issue: boolean;
      if (check.key === "buyer_filled_details") {
        issue = result.buylead_delete === 1 || result.buyer_filled_delete === 1;
      } else {
        issue = result[check.issue!] === 1;
      }
      // absurd_quantity reports skipped=true when it ran and found nothing, so the issue flag wins.
      const status = issue ? "issue_found" : skipped ? "skipped" : "no_issue";
      return { flag_id: check.flagId, check: check.name, status, detail: redact(result) };
    });

    return { display_id: input.display_id, checks };
  },
});
