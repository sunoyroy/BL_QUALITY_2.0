import { SourceError } from "./envelope";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new SourceError("NOT_CONFIGURED", `${name} is not set; this source cannot be read.`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}
