import "server-only";
import { z } from "zod";

const schema = z.object({
  ODOO_BASE_URL: z.string().url(),
  ODOO_DATABASE: z.string().min(1),
  ODOO_USERNAME: z.string().optional(),
  ODOO_API_SECRET: z.string().optional(),
  NEXTAUTH_SECRET: z.string().min(32),
});

let cached: z.infer<typeof schema> | null = null;
export function env() {
  if (!cached) {
    const r = schema.safeParse(process.env);
    if (!r.success) {
      const keys = r.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid environment configuration: ${keys}`);
    }
    cached = r.data;
  }
  return cached;
}
