// Common response envelope for every read tool (guide section 5.4).

export type ToolStatus =
  | "SUCCESS"
  | "PARTIAL"
  | "NOT_FOUND"
  | "STALE"
  | "DENIED"
  | "TIMEOUT"
  | "SCHEMA_ERROR"
  | "NOT_CONFIGURED"
  | "ERROR";

export interface Envelope<T> {
  tool_name: string;
  subject_id: string;
  status: ToolStatus;
  source_systems: string[];
  retrieved_at: string;
  data_as_of: string | null;
  schema_version: "1.0";
  records: T[];
  warnings: string[];
  error: string | null;
}

export class SourceError extends Error {
  constructor(
    readonly status: ToolStatus,
    message: string,
  ) {
    super(message);
  }
}

export interface EnvelopeContext {
  warn(message: string): void;
  /** Marks the result PARTIAL: a non-critical sub-source failed but other records are usable. */
  partial(message: string): void;
}

export async function withEnvelope<T>(
  toolName: string,
  subjectId: string | number,
  sourceSystems: string[],
  run: (ctx: EnvelopeContext) => Promise<{ records: T[]; dataAsOf?: string | null }>,
): Promise<Envelope<T>> {
  const warnings: string[] = [];
  let isPartial = false;
  const base = {
    tool_name: toolName,
    subject_id: String(subjectId),
    source_systems: sourceSystems,
    retrieved_at: new Date().toISOString(),
    schema_version: "1.0" as const,
  };
  try {
    const { records, dataAsOf = null } = await run({
      warn: (m) => warnings.push(m),
      partial: (m) => {
        isPartial = true;
        warnings.push(m);
      },
    });
    // A failed sub-source means "nothing found" is unproven, so empty + partial stays PARTIAL.
    const status: ToolStatus = isPartial ? "PARTIAL" : records.length === 0 ? "NOT_FOUND" : "SUCCESS";
    return { ...base, status, data_as_of: dataAsOf, records, warnings, error: null };
  } catch (err) {
    const status: ToolStatus = err instanceof SourceError ? err.status : classify(err);
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, status, data_as_of: null, records: [], warnings, error: message };
  }
}

function classify(err: unknown): ToolStatus {
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return "TIMEOUT";
  return "ERROR";
}
