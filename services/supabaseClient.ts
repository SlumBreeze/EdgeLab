import { createClient } from "@supabase/supabase-js";

// Access environment variables directly so Vite can statically replace them during build
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Supabase URL or Key is missing in environment variables. Sync will be disabled.",
  );
}

// Fallback to avoid crash if keys are missing (Sync will fail gracefully)
const validUrl = supabaseUrl || "https://placeholder.supabase.co";
const validKey = supabaseKey || "placeholder";

export const supabase = createClient(validUrl, validKey);

export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);

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
