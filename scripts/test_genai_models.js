import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

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

const ai = new GoogleGenAI({ apiKey: envConfig.VITE_GEMINI_API_KEY });

const model = "gemini-3-flash-preview";

async function testTool() {
  console.log(`Testing Tool Support for: ${model}...`);
  try {
    const resp = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text: "Who won the Super Bowl in 2024?" }] },
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    console.log("Response Object Keys:", Object.keys(resp));
    if (resp.text) {
      console.log("✅ Text received:", resp.text().substring(0, 50) + "...");
    } else {
      console.log("⚠️ No text function/property on response.");
      console.log("Candidates:", JSON.stringify(resp.candidates, null, 2));
    }
  } catch (e) {
    console.log(`❌ FAILED: ${model}`);
    if (e.message) console.log(`   Error: ${e.message}`);
  }
}

testTool();
