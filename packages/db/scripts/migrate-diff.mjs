// Prints the SQL that turns the last committed schema into the current one,
// WITHOUT touching any database (no shadow DB). Usage:
//   pnpm --filter @ethio/db migrate:diff > prisma/migrations/<timestamp>_<name>/migration.sql
// Review the SQL, commit it, then apply with `migrate:deploy`.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let from = ["--from-empty"];
try {
  const committed = execFileSync("git", ["show", "HEAD:./prisma/schema.prisma"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const file = join(mkdtempSync(join(tmpdir(), "schema-")), "schema.prisma");
  writeFileSync(file, committed);
  from = ["--from-schema-datamodel", file];
} catch {
  console.error("-- No committed schema found; diffing from an empty database.");
}

execFileSync(
  "npx",
  ["prisma", "migrate", "diff", ...from, "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
  { stdio: "inherit", shell: process.platform === "win32" },
);
