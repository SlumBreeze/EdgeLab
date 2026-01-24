import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Load .env manualy since we are in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");

let envConfig = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length > 0) {
      const val = valueParts.join("=").trim();
      const cleanVal = val.replace(/^["']|["']$/g, "");
      envConfig[key.trim()] = cleanVal;
    }
  });
}

const supabase = createClient(
  envConfig.VITE_SUPABASE_URL,
  envConfig.VITE_SUPABASE_ANON_KEY,
);

const today = new Date().toLocaleDateString("en-CA");
const userId = "edgelab-primary";

async function check() {
  console.log(`Checking for User: ${userId}, Date: ${today}`);

  const { data, error } = await supabase
    .from("daily_slates")
    .select("id, date, all_sports_data, queue")
    .eq("user_id", userId)
    .eq("date", today)
    .single();

  if (error) {
    console.error("Supabase Error:", error);
  } else {
    console.log("Record Found:", data.id);
    const keys = data.all_sports_data ? Object.keys(data.all_sports_data) : [];
    console.log(`all_sports_data keys: ${keys.join(", ")}`);
    if (keys.length === 0) {
      console.warn("WARNING: all_sports_data is empty!");
    } else {
      console.log(`Data found for ${keys.length} sports.`);
      const size = JSON.stringify(data.all_sports_data).length;
      console.log(`Approx payload size: ${(size / 1024).toFixed(2)} KB`);
    }
  }
}

check();
