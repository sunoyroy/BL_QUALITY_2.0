import { defineTool } from "eve/tools";
import { z } from "zod";
import { withEnvelope } from "../lib/envelope";
import { fetchIsq } from "../lib/isq";

export default defineTool({
  description:
    "Get the ISQ (specification) questions defined for an MCAT: question text, type, allowed options and priority, plus the allowed " +
    "quantity units. Source: getisq service in MCAT-only mode. Use it to check whether a BL's specs and unit are valid for its MCAT.",
  inputSchema: z.object({ mcat_id: z.number().int().positive() }),
  label: { start: ({ mcat_id }) => `Fetch spec definitions for MCAT ${mcat_id}` },
  async execute({ mcat_id }, ctx) {
    return withEnvelope("get_attribute_definitions", mcat_id, ["getisq"], async () => {
      const rows = await fetchIsq(mcat_id, null, ctx.abortSignal);
      return {
        records: rows.map((r) => ({
          spec_id: r.spec_id,
          question: r.question,
          type: r.type,
          options: r.options.slice(0, 50),
          priority: r.priority,
        })),
      };
    });
  },
});
