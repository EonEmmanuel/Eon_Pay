import { createHmac, timingSafeEqual } from "node:crypto";
import { Logger, UnauthorizedException } from "@nestjs/common";

const logger = new Logger("ProviderSecurity");

function constantTimeHexEqual(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(actual) || !/^[a-f0-9]{64}$/i.test(expected)) {
    return false;
  }
  const actualBuffer = Buffer.from(actual.toLowerCase(), "utf8");
  const expectedBuffer = Buffer.from(expected.toLowerCase(), "utf8");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function verifyHmacSha256(
  body: Buffer,
  signature: string | undefined,
  secret: string | undefined,
): void {
  if (signature === undefined || secret === undefined) {
    throw new UnauthorizedException("Missing webhook authentication.");
  }
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const normalized = signature.replace(/^sha256=/i, "");
  if (!constantTimeHexEqual(normalized, expected)) {
    throw new UnauthorizedException("Invalid webhook signature.");
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function verifyTimestamp(
  timestamp: string | undefined,
  windowSeconds = 300,
): void {
  const value = Number(timestamp);
  const now = Math.floor(Date.now() / 1_000);
  if (
    timestamp === undefined ||
    !Number.isSafeInteger(value) ||
    Math.abs(now - value) > windowSeconds
  ) {
    const drift = Number.isSafeInteger(value) ? Math.abs(now - value) : "N/A";
    logger.warn(
      `Webhook timestamp rejected — received: ${timestamp ?? "missing"}, server: ${now}, drift: ${drift}s, window: ${windowSeconds}s`,
    );
    throw new UnauthorizedException("Webhook timestamp is missing or stale.");
  }
}

export function verifyCanonicalHmacSha256(
  payload: unknown,
  signature: string | undefined,
  secret: string | undefined,
): void {
  if (signature === undefined || secret === undefined) {
    throw new UnauthorizedException("Missing webhook authentication.");
  }
  const expected = createHmac("sha256", secret)
    .update(canonicalJson(payload), "utf8")
    .digest("hex");
  if (!constantTimeHexEqual(signature, expected)) {
    throw new UnauthorizedException("Invalid webhook signature.");
  }
}
