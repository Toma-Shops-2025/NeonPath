import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

// Try to find the key under any of the common names
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_API;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("NEON PATH ERROR: Missing Supabase Environment Variables!");
  console.log("Expected VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(
    supabaseUrl || "",
    supabaseAnonKey?.trim() || "" // .trim() removes accidental spaces from copy-pasting
);
