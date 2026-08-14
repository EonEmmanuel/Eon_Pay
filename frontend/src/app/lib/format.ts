export function money(value: number, compact = false): string {
  return new Intl.NumberFormat("fr-CM", {
    style: "currency",
    currency: "XAF",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

export function dateTime(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "Not available";
  }
  return new Intl.DateTimeFormat("en-CM", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "Not available";
  }
  return new Intl.DateTimeFormat("en-CM", {
    dateStyle: "medium",
  }).format(new Date(value));
}
