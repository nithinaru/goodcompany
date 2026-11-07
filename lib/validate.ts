import { ApiError } from "./http";

type Obj = Record<string, unknown>;

export function onlyKeys(body: Obj, allowed: string[], what: string) {
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length)
    throw new ApiError(
      400,
      `${what} has fields that are not allowed: ${extra.join(", ")}`,
      `allowed fields: ${allowed.join(", ")}. Remove the extra fields and retry.`
    );
}

export function str(body: Obj, key: string, opts: { optional?: boolean; max?: number } = {}): string | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === "") {
    if (opts.optional) return undefined;
    throw new ApiError(400, `'${key}' is required and must be a non-empty string`);
  }
  if (typeof v !== "string") throw new ApiError(400, `'${key}' must be a string, got ${typeof v}`);
  const max = opts.max ?? 500;
  if (v.length > max) throw new ApiError(400, `'${key}' is too long (${v.length} chars, max ${max})`);
  return v.trim();
}

export function strArr(body: Obj, key: string, opts: { max?: number; min?: number; optional?: boolean } = {}): string[] {
  const v = body[key];
  if (v === undefined || v === null) {
    if (opts.optional) return [];
    throw new ApiError(400, `'${key}' is required and must be an array of strings`);
  }
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string"))
    throw new ApiError(400, `'${key}' must be an array of strings, e.g. ["a","b"]`);
  if (opts.max !== undefined && v.length > opts.max)
    throw new ApiError(400, `'${key}' has ${v.length} items, max is ${opts.max}`);
  if (opts.min !== undefined && v.length < opts.min)
    throw new ApiError(400, `'${key}' needs at least ${opts.min} items`);
  return (v as string[]).map((s) => s.trim());
}

export function oneOf<T extends string>(body: Obj, key: string, values: readonly T[], optional = false): T | undefined {
  const v = body[key];
  if (v === undefined || v === null) {
    if (optional) return undefined;
    throw new ApiError(400, `'${key}' is required, one of: ${values.join(" | ")}`);
  }
  if (typeof v !== "string" || !values.includes(v as T))
    throw new ApiError(400, `'${key}' must be one of: ${values.join(" | ")} (got ${JSON.stringify(v)})`);
  return v as T;
}

export function num(body: Obj, key: string): number {
  const v = body[key];
  const n = typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0)
    throw new ApiError(400, `'${key}' must be a non-negative number (dollars), e.g. 35`);
  return n;
}
