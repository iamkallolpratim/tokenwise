/**
 * Minimal JSON Schema validator for eval criteria. Supported keywords: type, required, properties,
 * additionalProperties (boolean), enum, const, items, minLength, maxLength, minimum, maximum.
 * Unsupported keywords are reported, never silently ignored.
 */
type Schema = Record<string, unknown>;

const SUPPORTED = new Set([
  "type",
  "required",
  "properties",
  "additionalProperties",
  "enum",
  "const",
  "items",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "$schema",
  "title",
  "description",
]);

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

export function validateJsonSchema(value: unknown, schema: Schema, at = "$"): string[] {
  const errors: string[] = [];
  for (const k of Object.keys(schema))
    if (!SUPPORTED.has(k)) errors.push(`${at}: unsupported schema keyword "${k}"`);
  const t = schema.type;
  if (t !== undefined) {
    const allowed = Array.isArray(t) ? t : [t];
    const actual = typeOf(value);
    if (!allowed.some((a) => a === actual || (a === "number" && actual === "integer")))
      errors.push(`${at}: expected ${allowed.join("|")}, got ${actual}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value)))
    errors.push(`${at}: not in enum`);
  if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(value))
    errors.push(`${at}: not equal to const`);
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength)
      errors.push(`${at}: shorter than ${schema.minLength}`);
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength)
      errors.push(`${at}: longer than ${schema.maxLength}`);
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum)
      errors.push(`${at}: below ${schema.minimum}`);
    if (typeof schema.maximum === "number" && value > schema.maximum)
      errors.push(`${at}: above ${schema.maximum}`);
  }
  if (typeOf(value) === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(schema.required))
      for (const r of schema.required)
        if (typeof r === "string" && !(r in obj)) errors.push(`${at}: missing required "${r}"`);
    const props = (schema.properties ?? {}) as Record<string, Schema>;
    for (const [k, v] of Object.entries(obj)) {
      if (props[k]) errors.push(...validateJsonSchema(v, props[k], `${at}.${k}`));
      else if (schema.additionalProperties === false) errors.push(`${at}: unexpected property "${k}"`);
    }
  }
  if (Array.isArray(value) && schema.items && typeof schema.items === "object") {
    value.forEach((v, i) => {
      errors.push(...validateJsonSchema(v, schema.items as Schema, `${at}[${i}]`));
    });
  }
  return errors;
}

/** Extracts a JSON value from model output, tolerating a surrounding code fence. */
export function parseJsonOutput(text: string): unknown {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(text);
  return JSON.parse((fenced?.[1] ?? text).trim());
}
