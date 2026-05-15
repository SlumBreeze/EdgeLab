import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const serverRoot = join(root, "server");
const viteBin = join(root, "node_modules", "vite", "bin", "vite.js");
const tsxCli = join(serverRoot, "node_modules", "tsx", "dist", "cli.mjs");

if (!existsSync(join(serverRoot, "node_modules"))) {
  console.error("Server dependencies are missing. Run `npm install` once from the repo root, then run `npm run dev` again.");
  process.exit(1);
}

if (!existsSync(viteBin) || !existsSync(tsxCli)) {
  console.error("Local dev tools are missing. Run `npm install` once from the repo root, then run `npm run dev` again.");
  process.exit(1);
}

const processes = [
  {
    name: "api",
    command: process.execPath,
    args: [tsxCli, "watch", "src/index.ts"],
    cwd: serverRoot,
  },
  {
    name: "web",
    command: process.execPath,
    args: [viteBin],
    cwd: root,
  },
];

let shuttingDown = false;

const children = processes.map(({ name, command, args, cwd }) => {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  child.on("error", (error) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`${name} failed to start: ${error.message}`);
    stopAll();
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`${name} stopped${signal ? ` with signal ${signal}` : ` with code ${code}`}. Shutting down local dev.`);
    stopAll();
    process.exit(code ?? 1);
  });

  return child;
});

const stopAll = () => {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shuttingDown = true;
    stopAll();
    process.exit(0);
  });
}
