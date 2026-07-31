import fs from "node:fs";
import path from "node:path";
import express from "express";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { openDatabase, Store } from "./storage/database.js";

const config = loadConfig();
const db = openDatabase(config.sqlitePath);
const app = createApp({ config, store: new Store(db) });

const frontendDist = path.resolve(process.cwd(), "dist");
if (fs.existsSync(path.join(frontendDist, "index.html"))) {
  app.use(express.static(frontendDist, { index: false }));
  app.get(/^(?!\/api(?:\/|$)|\/healthz$).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.listen(config.port, () => {
  console.log(`EdgeLab backend listening on http://localhost:${config.port}`);
});
