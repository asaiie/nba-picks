import assert from "node:assert/strict";
const base = "http://localhost:8788";
async function call(path, body, cookie, origin = base) {
  const r = await fetch(base + "/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
assert.equal((await call("state")).status, 401);
const a = await call("login", {
  id: 1,
  password: "LocalTestOnly!123",
  setup: true,
});
assert.equal(a.status, 200, JSON.stringify(a));
const b = await call("login", {
  id: 2,
  password: "LocalTestOnly!456",
  setup: true,
});
assert.equal(b.status, 200, JSON.stringify(b));
assert.equal(
  (await call("login", { id: 1, password: "WrongPassword!" })).status,
  401,
);
assert.equal(
  (
    await call(
      "prediction",
      { category: "MVP", value: "Test" },
      a.cookie,
      "https://evil.example",
    )
  ).status,
  403,
);
assert.equal((await call("admin/reset", { id: 3 }, b.cookie)).status, 403);
const game = {
  id: "integration-test",
  home: "BOS",
  away: "NYK",
  tipoff: Date.now() + 3600000,
  status: "scheduled",
};
assert.equal((await call("admin/game", game, a.cookie)).status, 200);
assert.equal(
  (await call("pick", { game_id: game.id, team: "BOS", user_id: 1 }, b.cookie))
    .status,
  200,
);
let state = (await call("state", undefined, a.cookie)).data;
assert(state.picks.some((p) => p.game_id === game.id && p.user_id === 2));
assert(!state.picks.some((p) => p.game_id === game.id && p.user_id === 1));
assert.equal(
  (await call("pick", { game_id: game.id, team: "LAL" }, b.cookie)).status,
  409,
);
assert.equal(
  (await call("admin/game", { ...game, tipoff: Date.now() - 1000 }, a.cookie))
    .status,
  200,
);
assert.equal(
  (await call("pick", { game_id: game.id, team: "NYK" }, b.cookie)).status,
  409,
);
assert.equal(
  (
    await call(
      "admin/game",
      { ...game, status: "final", winner: "NYK" },
      a.cookie,
    )
  ).status,
  200,
);
assert.equal(
  (await call("pick", { game_id: game.id, team: "BOS" }, a.cookie)).status,
  409,
);
assert.equal(
  (
    await call(
      "prediction",
      { category: "east", value: Array(10).fill("BOS") },
      a.cookie,
    )
  ).status,
  400,
);
assert.equal(
  (await call("prediction", { category: "MVP", value: "Local test" }, b.cookie))
    .status,
  200,
);
assert.equal((await call("admin/reset", { id: 2 }, a.cookie)).status, 200);
assert.equal((await call("state", undefined, b.cookie)).status, 401);
const stale = await call("login", {id:2,password:"LocalTestOnly!456"});
assert.equal(stale.status,409);
assert.equal(stale.data.code,"SETUP_REQUIRED");
const resetLogin = await call("login", {id:2,password:"LocalResetOnly!789",setup:true});
assert.equal(resetLogin.status,200);
const restored = await call("state", undefined, resetLogin.cookie);
assert.equal(restored.status,200);
assert(restored.data.picks.some(p=>p.user_id===2 && p.game_id===game.id));
assert.equal((await call("login", {id:2,password:"LocalTestOnly!456"})).status,401);
await call("admin/reset",{id:2},a.cookie);

assert.equal((await call("logout", {}, a.cookie)).status, 200);
assert.equal((await call("state", undefined, a.cookie)).status, 401);
console.log(
  "API checks passed: auth, CSRF, own-pick permissions, locks, admin permissions, validation, reset, logout. Local fixtures remain; run cleanup SQL.",
);
