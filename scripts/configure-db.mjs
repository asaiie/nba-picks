import { writeFile, access } from "node:fs/promises";
const id = process.argv[2];
if (!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id || ""))
  throw Error("Usage: node scripts/configure-db.mjs <D1 database UUID>");
try {
  await access("wrangler.jsonc");
  throw Error("wrangler.jsonc already exists. Edit its database_id directly.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await writeFile(
  "wrangler.jsonc",
  JSON.stringify(
    {
      name: "nba-picks",
      main: "worker.js",
      assets: { directory: "public", binding: "ASSETS", run_worker_first: true },
      build: {command: "npm run build"},
      routes: [{pattern: "nba.amitsai.com", custom_domain: true}],
      compatibility_date: "2026-10-19",
      d1_databases: [
        { binding: "DB", database_name: "nba-picks", database_id: id },
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log("Created wrangler.jsonc. Run npm run db:remote to initialize D1.");
