import { SourceError } from "./envelope";

export interface HttpOptions {
  method?: "GET" | "POST";
  json?: unknown;
  form?: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Calls an internal LEAP/IndiaMART HTTP service and returns the parsed JSON body. */
export async function httpJson<T = unknown>(url: string, options: HttpOptions = {}): Promise<T> {
  const { method = "POST", json, form, headers = {}, timeoutMs = 5_000, signal } = options;
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (signal) signals.push(signal);

  let body: string | undefined;
  if (json !== undefined) {
    body = JSON.stringify(json);
    headers["Content-Type"] ??= "application/json";
  } else if (form) {
    // The Go services build these bodies by hand, so values that are already encoded stay as-is.
    body = Object.entries(form)
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    headers["Content-Type"] ??= "application/x-www-form-urlencoded";
  }

  let response: Response;
  try {
    response = await fetch(url, { method, body, headers, signal: AbortSignal.any(signals) });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new SourceError("TIMEOUT", `${hostOf(url)} did not answer within ${timeoutMs} ms`);
    }
    throw new SourceError("ERROR", `${hostOf(url)} unreachable: ${(err as Error).message}`);
  }

  const text = await response.text();
  if (response.status === 401 || response.status === 403) {
    throw new SourceError("DENIED", `${hostOf(url)} refused access (HTTP ${response.status})`);
  }
  if (!response.ok) {
    throw new SourceError("ERROR", `${hostOf(url)} returned HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SourceError("SCHEMA_ERROR", `${hostOf(url)} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
