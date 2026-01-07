import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

console.log("Starting server...");
console.log("PORT:", PORT);
console.log("__dirname:", __dirname);

// Serve static files from the build directory
const distPath = path.join(__dirname, "../dist");
console.log("Serving static files from:", distPath);
app.use(express.static(distPath));

// Handle SPA routing - Use app.use for catch-all to avoid Express 5 wildcard issues
app.use((req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is listening on http://0.0.0.0:${PORT}`);
});
