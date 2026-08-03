import { supabase } from "./supabase";

const apiUrl = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");

export interface ApiErrorPayload {
  message?: string | string[];
  requestId?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function selectedTenantId(): string | undefined {
  return window.localStorage.getItem("selected-tenant-id") ?? undefined;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { tenant?: boolean } = {},
): Promise<T> {
  if (supabase === undefined) {
    throw new ApiError("Supabase Auth is not configured.", 503);
  }
  const { data, error } = await supabase.auth.getSession();
  if (error !== null || data.session === null) {
    throw new ApiError("Your session expired. Sign in again.", 401);
  }
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${data.session.access_token}`);
  headers.set("accept", "application/json");
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  if (init.tenant !== false) {
    const tenantId = selectedTenantId();
    if (tenantId === undefined) {
      throw new ApiError("Select an organization before continuing.", 400);
    }
    headers.set("x-tenant-id", tenantId);
  }
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    throw new ApiError(
      "Cannot reach the backend API. Verify that the server is running and the API URL is configured for this deployment.",
      0,
      error instanceof Error ? error.name : undefined,
    );
  }
  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      payload = {};
    }
    const message = Array.isArray(payload.message)
      ? payload.message.join(" ")
      : (payload.message ?? `Request failed with status ${response.status}.`);
    throw new ApiError(message, response.status, payload.requestId);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function apiDownload(path: string, fileName: string): Promise<void> {
  if (supabase === undefined)
    throw new ApiError("Supabase Auth is not configured.", 503);
  const { data } = await supabase.auth.getSession();
  if (data.session === null) throw new ApiError("Your session expired.", 401);
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { authorization: `Bearer ${data.session.access_token}` },
    cache: "no-store",
  });
  if (!response.ok)
    throw new ApiError("The compliance report is unavailable.", response.status);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function idempotencyKey(scope: string): string {
  return `${scope}:${crypto.randomUUID()}`;
}
