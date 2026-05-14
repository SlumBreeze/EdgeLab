import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { openDatabase, Store } from "./storage/database.js";

const config = loadConfig();
const db = openDatabase(config.sqlitePath);
const app = createApp({ config, store: new Store(db) });

app.listen(config.port, () => {
  console.log(`EdgeLab backend listening on http://localhost:${config.port}`);
});
