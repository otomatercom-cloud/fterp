import { NextResponse } from "next/server";
import { serviceHealth } from "@/lib/odoo/client";

export async function GET() {
  const h = await serviceHealth();
  return NextResponse.json(h, { status: h.ok ? 200 : 503 });
}
