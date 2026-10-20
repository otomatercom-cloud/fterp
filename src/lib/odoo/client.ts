import "server-only";
import { env } from "@/lib/env";

export class OdooError extends Error {
  constructor(message: string, public code: "network" | "auth" | "access" | "odoo" | "timeout", public detail?: unknown) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;

type RpcResponse<T> = { result?: T; error?: { message?: string; data?: { name?: string; message?: string } } };

async function rpc<T>(path: string, params: unknown, sessionId?: string, timeoutMs = TIMEOUT_MS): Promise<{ data: T; res: Response }> {
  let res: Response;
  try {
    res = await fetch(`${env().ODOO_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(sessionId ? { Cookie: `session_id=${sessionId}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (e) {
    const timeout = e instanceof Error && e.name === "TimeoutError";
    throw new OdooError(timeout ? "Odoo request timed out" : "Cannot reach Odoo", timeout ? "timeout" : "network");
  }
  if (!res.ok) throw new OdooError(`Odoo HTTP ${res.status}`, "network");
  const body = (await res.json()) as RpcResponse<T>;
  if (body.error) {
    const name = body.error.data?.name ?? "";
    const code = name.includes("AccessError") ? "access" : name.includes("SessionExpired") ? "auth" : "odoo";
    throw new OdooError(body.error.data?.message ?? body.error.message ?? "Odoo error", code, body.error);
  }
  return { data: body.result as T, res };
}

export type OdooLogin = { sessionId: string; uid: number; name: string };

/** Authenticates a user against Odoo; the session cookie is kept server-side only. */
export async function odooLogin(login: string, password: string): Promise<OdooLogin> {
  const { data, res } = await rpc<{ uid: number | false; name?: string }>("/web/session/authenticate", {
    db: env().ODOO_DATABASE,
    login,
    password,
  });
  if (!data?.uid) throw new OdooError("Invalid login or password", "auth");
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("session_id="));
  const sessionId = cookie?.split(";")[0].slice("session_id=".length);
  if (!sessionId) throw new OdooError("Odoo did not return a session", "auth");
  return { sessionId, uid: data.uid, name: data.name ?? login };
}

export type CallOpts = { companyIds?: number[]; lang?: string; timeoutMs?: number };

/** Calls an ORM method as the logged-in user, so Odoo ACLs and record rules always apply. */
export async function callKw<T>(
  sessionId: string,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
  opts: CallOpts = {},
): Promise<T> {
  const context = { ...(kwargs.context as object | undefined), ...(opts.companyIds ? { allowed_company_ids: opts.companyIds } : {}) };
  const { data } = await rpc<T>(
    `/web/dataset/call_kw/${model}/${method}`,
    { model, method, args, kwargs: { ...kwargs, context } },
    sessionId,
    opts.timeoutMs,
  );
  return data;
}

/** Service-account connectivity check via the Odoo 19 external JSON-2 API (API key). */
export async function serviceHealth(): Promise<{ ok: boolean; detail: string }> {
  let e: ReturnType<typeof env>;
  try {
    e = env();
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "Invalid environment" };
  }
  if (!e.ODOO_API_SECRET) return { ok: false, detail: "ODOO_API_SECRET not set" };
  try {
    const res = await fetch(`${e.ODOO_BASE_URL}/json/2/res.company/search_count`, {
      method: "POST",
      headers: {
        Authorization: `bearer ${e.ODOO_API_SECRET}`,
        "X-Odoo-Database": e.ODOO_DATABASE,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ domain: [] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return res.ok ? { ok: true, detail: "Odoo JSON-2 reachable" } : { ok: false, detail: `HTTP ${res.status}` };
  } catch {
    return { ok: false, detail: "Cannot reach Odoo" };
  }
}

/** Fetches an Odoo-rendered PDF as the logged-in user (Odoo enforces access). */
export async function odooGetPdf(sessionId: string, path: string): Promise<ArrayBuffer> {
  let res: Response;
  try {
    res = await fetch(`${env().ODOO_BASE_URL}${path}`, { headers: { Cookie: `session_id=${sessionId}` }, signal: AbortSignal.timeout(30_000), cache: "no-store" });
  } catch {
    throw new OdooError("Cannot reach Odoo", "network");
  }
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("pdf")) throw new OdooError("PDF is not available", "odoo");
  return res.arrayBuffer();
}
