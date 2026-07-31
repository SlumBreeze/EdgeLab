import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

const readBoolean = (value: string | undefined, fallback: boolean) => {
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value.trim().toLowerCase()))
    return true;
  if (["0", "false", "no", "off"].includes(value.trim().toLowerCase()))
    return false;
  return fallback;
};

export const isAuthRequired = readBoolean(
  import.meta.env.VITE_AUTH_REQUIRED,
  import.meta.env.PROD,
);

if (!supabaseUrl || !supabaseKey) {
  const message = isAuthRequired
    ? "Supabase Auth configuration is missing. Private access is locked."
    : "Supabase configuration is missing. Auth and legacy sync are disabled locally.";
  console.warn(message);
}

const validUrl = supabaseUrl || "https://placeholder.supabase.co";
const validKey = supabaseKey || "placeholder";

export const supabase = createClient(validUrl, validKey);

export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);
export const authConfigurationError =
  isAuthRequired && !isSupabaseConfigured
    ? "Private access is enabled, but VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not configured."
    : null;

export async function fetchDailySlate(userId: string, date: string) {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from("daily_slates")
    .select(
      "queue, daily_plays, scan_results, reference_lines, all_sports_data",
    )
    .eq("user_id", userId)
    .eq("date", date)
    .single();

  if (error) {
    if (error.code !== "PGRST116") {
      // PGRST116 is "no rows found" -> return null
      console.warn("Error fetching slate:", error);
    }
    return null;
  }
  return data;
}
