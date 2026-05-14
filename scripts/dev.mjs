import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

if (!existsSync(join(root, "server", "node_modules"))) {
  console.error("Server dependencies are missing. Run `npm install` once from the repo root, then run `npm run dev` again.");
  process.exit(1);
}

const processes = [
  {
    name: "api",
    command: npmCommand,
    args: ["--prefix", "server", "run", "dev"],
  },
  {
    name: "web",
    command: npmCommand,
    args: ["run", "dev:frontend"],
  },
];

let shuttingDown = false;

const children = processes.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
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
