import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://vnfdbbeimvisnfdnlzcm.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_188r2i8W9LAIZfw6J4IgqA_XzUgSzcX";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
