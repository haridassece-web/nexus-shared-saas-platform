import type { SupabaseClient } from "@supabase/supabase-js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      db?: SupabaseClient;
      businessId?: string;
      role?: string;
      subscription?: any;
    }
  }
}

export {};
