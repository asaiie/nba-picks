import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canPick,
  standings,
  validPrediction,
  easternDay,
  EAST,
} from "../shared.js";
test("locks exactly at tipoff and excludes postponed/canceled/final games", () => {
  assert.equal(canPick({ status: "scheduled", tipoff: 100 }, 99), true);
  assert.equal(canPick({ status: "scheduled", tipoff: 100 }, 100), false);
  for (const status of ["postponed", "canceled", "final"])
    assert.equal(canPick({ status, tipoff: 100 }, 1), false);
});
test("missed picks count against accuracy only for final games", () => {
  const games = [
    { id: "a", status: "final", winner: "BOS" },
    { id: "b", status: "final", winner: "NYK" },
    { id: "c", status: "postponed" },
    { id: "d", status: "scheduled" },
    { id: "e", status: "canceled" },
  ];
  const [row] = standings([{ id: 1 }], games, [
    { user_id: 1, game_id: "a", team: "BOS" },
  ]);
  assert.equal(row.accuracy, 0.5);
  assert.equal(row.total, 2);
  assert.equal(row.missed, 1);
});
test("result corrections change accuracy without rewriting picks", () => {
  const games = [{ id: "a", status: "final", winner: "BOS" }],
    picks = [{ user_id: 1, game_id: "a", team: "BOS" }];
  assert.equal(standings([{ id: 1 }], games, picks)[0].accuracy, 1);
  games[0].winner = "NYK";
  assert.equal(standings([{ id: 1 }], games, picks)[0].accuracy, 0);
});
test("seeds reject repeated teams and wrong conferences but allow partial picks", () => {
  assert(validPrediction("east", EAST.slice(0, 10)));
  assert(validPrediction("east", Array(10).fill("")));
  assert(!validPrediction("east", Array(10).fill("BOS")));
  assert(!validPrediction("east", ["LAL", ...EAST.slice(0, 9)]));
  assert(!validPrediction("east_champ", "LAL"));
  assert(validPrediction("champ", "LAL"));
});
test("Eastern dates correctly handle UTC rollover and daylight savings", () => {
  assert.equal(easternDay(Date.parse("2026-10-21T02:00:00Z")), "2026-10-20");
  assert.equal(easternDay(Date.parse("2027-01-21T04:30:00Z")), "2027-01-20");
});
