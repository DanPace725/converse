import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
for (const dir of ["api", "lib", "scripts", "public"])
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".js")) continue;
    const r = spawnSync(process.execPath, ["--check", dir + "/" + file], {
      stdio: "inherit",
    });
    if (r.status) process.exit(r.status);
  }
console.log("Syntax checks passed");
