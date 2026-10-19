# NBA Picks

Private, four-person NBA predictions for nba.amitsai.com. Vanilla JS interface, a Cloudflare Worker, and D1. Accounts: Amit (admin), Amol, Garv, Praneeth. First login claims a name with a password; this deliberately uses group trust, without invite links.

## Deployment

The existing `nba-picks` project is a **Cloudflare Worker**, not Pages. The app uses Worker static assets and D1, preserving nba.amitsai.com. `wrangler.jsonc` declares the production database binding, asset build, and existing custom domain.

The production database has been initialized with four unclaimed accounts and 1,200 games. No passwords are set by the migrations.

```sh
npm install
npx wrangler login
npm run deploy
```

Wrangler runs `npm run build` automatically before uploading. For Git-based Workers Builds, use deploy command `npx wrangler deploy`; no Pages output-directory setting is needed. A separate build command is optional because Wrangler already invokes the build.

Open https://nba.amitsai.com and claim Amit first; friends can claim their own names. Do not use the local integration-test passwords on the live site.

For a fresh database, change `database_id` in `wrangler.jsonc` and run `npm run db:remote`. Both migrations are safe to rerun and preserve existing data.

## Local development

```sh
npm install
npm run db:local
npm run dev
```

Wrangler prints the preview URL. Local data stays in ignored `.wrangler/`, separate from production. `wrangler.local.jsonc` is used explicitly by local database commands; it is not deployment configuration. The dev script uses the local config, never the production database.

## Checks

```sh
npm test
npm run build
```

`scripts/check-local.mjs` is an integration check intended ONLY for a disposable local database on localhost:8788. It claims Amit/Amol with local fixture passwords and writes local test data. It checks unauthenticated access, passwords, CSRF, account isolation, tip-off locks, invalid team picks, admin access, prediction validation, password resets, and logout. Do not use these test passwords in production. Reset the disposable local database after testing if needed.

## Rules

- Each game pick saves separately. All four accounts see all predictions.
- The server derives the author from the session; clients cannot select another author.
- A single conditional SQL write enforces team validity, scheduled status, and tip-off time, including on edits.
- Only finalized regular-season games enter accuracy. Missing picks are incorrect. Canceled/postponed games are excluded until finalized.
- Admin corrections recalculate accuracy from current results; no materialized score can go stale.
- Awards and conference/champion predictions remain editable and show update timestamps. They do not affect accuracy.
- All dates use `America/New_York` (EST/EDT).
- Passwords use salted PBKDF2-SHA256. Session tokens are random, hashed in D1, and sent in HttpOnly/Secure/SameSite cookies. Login attempts are limited by account and IP. Mutation requests require a matching Origin.
- Admin password resets revoke sessions and reopen first-use setup; picks remain. To recover Amit, use the D1 console to set user 1's password to NULL and delete user 1's sessions, then immediately claim it again.

## Schedule provenance

`migrations/0002_schedule.sql` is extracted from the [NBA's August 13, 2026 schedule release](https://ak-static.cms.nba.com/wp-content/uploads/sites/46/2026/08/2026-27-NBA-Regular-Season-Schedule-By-Date.pdf). It contains 1,200 games, exactly 80 per team, including the three neutral-site games. The second listed team is used as the home/designated-host column for neutral games. Every time is converted from the PDF's ET column using DST-aware timezone data.

The remaining 30 regular-season games depend on NBA Cup group results and must be added later. The Cup championship does not count toward regular-season accuracy. Schedule changes after the release need admin corrections. Results are entered manually.

To regenerate from a new version of that PDF, install Python `pypdf` and run:

```sh
python3 scripts/import-schedule.py /path/to/schedule.pdf migrations/0002_schedule.sql
```

The importer validates counts, duplicate game IDs, duplicate matchups, team codes, and season dates. It reports unparsed game rows. Its SQL uses INSERT OR IGNORE so reruns never overwrite saved results or schedule corrections. Update existing game times through Admin.

## Interface

Daily picks fit all four players on a phone. Longer awards/season comparison tables scroll horizontally. Awards currently use free-text full names; team predictions use conference-filtered selectors. Admin can add games, change times/status/results, enter award/season outcomes, and reset friends' passwords. A playoff bracket is intentionally deferred until the regular season ends.
