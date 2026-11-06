import { requireEnv } from "./config";
import { SourceError } from "./envelope";
import { httpJson } from "./http";

export interface SpecRow {
  spec_id: string;
  question: string;
  type: string;
  answer: string;
  options: string[];
  priority: string;
  source_priority: string;
}

// Same filter the Go BL-quality path applies (BlQualityRepo.go isValidRecord).
const BANNED_PREFIXES = [
  "probable",
  "why do you need this",
  "additional detail",
  "additional requirement",
  "buyer filled details",
  "type of requirement",
  "i want this for",
];

/** Calls the getisq service. With offerId: the lead's answers. Without: the MCAT's question definitions. */
export async function fetchIsq(mcatId: number | null, offerId: number | null, signal?: AbortSignal): Promise<SpecRow[]> {
  const base = requireEnv("ISQ_API_URL");
  const token = requireEnv("ISQ_TOKEN");
  const params = new URLSearchParams({
    modid: "LEAP",
    token,
    mcatid: String(mcatId ?? -1),
    cat_type: "3",
    fixed_attr: "1",
    isq_format: "1",
    generic_flag: "1",
    source: "1",
  });
  if (offerId !== null) {
    params.set("ofrid", String(offerId));
    params.set("edit", "1");
  }

  const body = await httpJson<Record<string, unknown>>(`${base}?${params}`, { method: "POST", timeoutMs: 5_000, signal });
  const response = (body.RESPONSE as Record<string, unknown> | undefined) ?? body;
  if (String(response.CODE) !== "200") {
    throw new SourceError(String(response.CODE) === "204" ? "NOT_FOUND" : "ERROR", `getisq returned CODE ${String(response.CODE)}`);
  }

  const rows: SpecRow[] = [];
  collect(response.DATA, rows);
  return rows;
}

// Combined keys such as "Quantity#Quantity Unit" nest question objects, so walk the whole tree.
function collect(node: unknown, out: SpecRow[]): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collect(n, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.IM_SPEC_MASTER_DESC === "string") {
    out.push({
      spec_id: String(obj.IM_SPEC_MASTER_ID ?? ""),
      question: obj.IM_SPEC_MASTER_DESC,
      type: String(obj.IM_SPEC_MASTER_TYPE ?? ""),
      answer: String(obj.ISQ_RESPONSE ?? ""),
      options: String(obj.IM_SPEC_OPTIONS_DESC ?? "")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
      priority: String(obj.IM_CAT_SPEC_PRIORITY ?? ""),
      source_priority: String(obj.IM_CAT_SPEC_PRIORITY_SOURCE ?? ""),
    });
    return;
  }
  Object.values(obj).forEach((v) => collect(v, out));
}

export function isBuyerSpec(row: SpecRow): boolean {
  const lower = row.question.toLowerCase();
  return !BANNED_PREFIXES.some((p) => lower.startsWith(p));
}
