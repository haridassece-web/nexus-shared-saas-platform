import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://vnfdbbeimvisnfdnlzcm.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_188r2i8W9LAIZfw6J4IgqA_XzUgSzcX";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Super Admin identification helper (Owner: Haridass)
 * Checks if user is Haridass by email or admin status.
 */
export function isSuperAdmin(userOrEmail?: any): boolean {
  if (!userOrEmail) return false;
  const email =
    typeof userOrEmail === "string" ? userOrEmail : userOrEmail?.email;
  if (!email || typeof email !== "string") return false;
  const normalized = email.toLowerCase().trim();
  return (
    normalized === "haridass.ece@gmail.com" ||
    normalized.includes("haridass")
  );
}

/**
 * Async check that also verifies the platform_admins table via Supabase RPC
 */
export async function checkIsAdmin(user?: any): Promise<boolean> {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  try {
    const { data } = await supabase.rpc("is_platform_admin");
    return Boolean(data);
  } catch {
    return false;
  }
}
