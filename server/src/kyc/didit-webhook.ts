export type DiditSessionKind = "kyc" | "kyb";

export function diditSessionKind(
  payload: Record<string, unknown>,
): DiditSessionKind | undefined {
  const data = recordValue(payload["data"]);
  const metadata = recordValue(payload["metadata"]) ?? recordValue(data["metadata"]);
  const value =
    stringValue(payload["session_kind"]) ??
    stringValue(data["session_kind"]) ??
    stringValue(metadata["session_kind"]);

  if (value !== undefined) {
    const normalized = value.toLowerCase();
    if (normalized === "business" || normalized === "kyb") return "kyb";
    if (normalized === "user" || normalized === "kyc") return "kyc";
  }

  if (
    stringValue(payload["business_session_id"]) !== undefined ||
    stringValue(data["business_session_id"]) !== undefined
  ) {
    return "kyb";
  }

  return undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
