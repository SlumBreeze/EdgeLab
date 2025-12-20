
import { createClient } from '@supabase/supabase-js';

// Credentials provided for the project
const supabaseUrl = "https://thcstqwbinhbkpstcvme.supabase.co";
const supabaseKey = "sb_publishable_DhIPIKNjey_m1laa3ntp_Q_vVIkoBYV";

if (!supabaseUrl) {
  console.error("Supabase URL is missing");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
