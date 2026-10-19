import { writeFile } from "node:fs/promises";
const base = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw Error(`${r.status}: ${url}`);
  return r.json();
}
const teams = (await get(`${base}/teams?limit=100`)).sports[0].leagues[0].teams;
if (teams.length !== 30) throw Error("Expected 30 NBA teams");
const players = new Map(),
  coaches = new Map();
for (let i = 0; i < teams.length; i += 5) {
  const batch = await Promise.all(
    teams
      .slice(i, i + 5)
      .map(async ({ team }) => ({
        team,
        roster: await get(`${base}/teams/${team.id}/roster`),
      })),
  );
  for (const { team, roster } of batch) {
    if (!roster.athletes?.length)
      throw Error(`Empty roster: ${team.displayName}`);
    for (const a of roster.athletes)
      players.set(a.id, {
        id: a.id,
        name: a.displayName || a.fullName,
        team: team.displayName,
      });
    for (const c of roster.coach || [])
      coaches.set(c.id, {
        id: c.id,
        name: c.firstName + " " + c.lastName,
        team: team.displayName,
      });
  }
}
if (players.size < 400 || coaches.size !== 30)
  throw Error(
    `Incomplete directory: ${players.size} players, ${coaches.size} coaches`,
  );
const sorted = (m) =>
  [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
await writeFile(
  "data/award-candidates.js",
  `// ESPN NBA roster snapshot, ${new Date().toISOString().slice(0, 10)}. Refresh with node scripts/update-award-candidates.mjs.\nexport const PLAYERS = ${JSON.stringify(sorted(players), null, 2)};\nexport const COACHES = ${JSON.stringify(sorted(coaches), null, 2)};\n`,
);
console.log(`Saved ${players.size} players and ${coaches.size} coaches.`);
