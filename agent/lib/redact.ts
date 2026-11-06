// Masks personal data before tool output reaches the model (guide sections 11.4 and 15).

const PATTERNS: [RegExp, string][] = [
  [/(?:\+?91[\s-]?)?\b[6-9]\d{9}\b/g, "[phone]"],
  [/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[email]"],
  [/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/gi, "[gstin]"],
  [/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[pan]"],
  [/\b(?:\d[\s-]?){13,16}\b/g, "[card]"],
];

export function redactText(text: string): string {
  return PATTERNS.reduce((t, [re, label]) => t.replace(re, label), text);
}

export function redact<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map(redact) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)])) as T;
  }
  return value;
}
