import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";

export type Company = { id: number; name: string };
export type Session = {
  sessionId: string; // Odoo session — never sent to the browser
  uid: number;
  name: string;
  companies: Company[]; // companies Odoo says this user may access
  companyId: number; // currently selected (must be in companies)
  groups: string[]; // xmlids, e.g. base.group_system
};

const COOKIE = "ierp_session";
const MAX_AGE = 60 * 60 * 8;
const key = () => new TextEncoder().encode(env().NEXTAUTH_SECRET);

export async function createSession(s: Session) {
  const token = await new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(`${MAX_AGE}s`).sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** Switching company only changes context; it must be one Odoo already granted. Odoo still enforces access. */
export async function switchCompany(companyId: number) {
  const s = await requireSession();
  if (!s.companies.some((c) => c.id === companyId)) throw new Error("Company not permitted");
  await createSession({ ...s, companyId });
}
