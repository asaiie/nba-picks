import test from "node:test";
import assert from "node:assert/strict";
import { SEASON_DEADLINE, seasonPredictionsLocked } from "../shared.js";

test("season picks lock at December 25 11:59 PM Eastern", () => {
  assert.equal(new Date(SEASON_DEADLINE).toISOString(), "2026-12-26T04:59:00.000Z");
  assert.equal(seasonPredictionsLocked(SEASON_DEADLINE - 1), false);
  assert.equal(seasonPredictionsLocked(SEASON_DEADLINE), true);
  assert.equal(seasonPredictionsLocked(SEASON_DEADLINE + 1), true);
});

import { onRequest } from "../server/api.js";
test("API rejects award, standings and champion writes after the deadline", async (t) => {
  t.mock.method(Date, "now", () => SEASON_DEADLINE);
  const env = { DB: { prepare(sql) {
    assert.match(sql, /JOIN sessions/);
    return { bind() { return { first: async () => ({ id: 1, name: "Amit", admin: 1 }) }; } };
  } } };
  for (const category of ["MVP", "EOTY", "east", "west", "champ"]) {
    const response = await onRequest({ env, request: new Request("https://nba.amitsai.com/api/prediction", {
      method: "POST",
      headers: { Origin: "https://nba.amitsai.com", Cookie: "nba_session=test", "Content-Type": "application/json" },
      body: JSON.stringify({ category, value: "" }),
    }) });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /locked/);
  }
});
