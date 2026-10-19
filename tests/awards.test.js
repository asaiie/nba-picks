import { test } from "node:test";
import assert from "node:assert/strict";
import {
  awardCandidates,
  canonicalAwardName,
  searchAwardCandidates,
} from "../award-directory.js";
test("player search supports diacritics, case and partial names", () => {
  assert.equal(canonicalAwardName("MVP", " NIKOLA JOKIĆ "), "Nikola Jokic");
  assert(
    searchAwardCandidates("MVP", "jok").some((p) => p.name === "Nikola Jokic"),
  );
  assert(
    searchAwardCandidates("DPOY", "victor wem").some(
      (p) => p.name === "Victor Wembanyama",
    ),
  );
});
test("only directory selections are accepted, with a separate coach pool", () => {
  assert.equal(canonicalAwardName("MVP", "Nikola Jokicc"), null);
  assert.equal(canonicalAwardName("COTY", "Nikola Jokic"), null);
  assert.equal(canonicalAwardName("MVP", ""), "");
  assert.equal(awardCandidates("COTY").length, 30);
  assert(awardCandidates("MVP").length > 400);
  const coach = awardCandidates("COTY")[0];
  assert.equal(canonicalAwardName("COTY", coach.name), coach.name);
});
