import { TEAMS, validPrediction, easternDay } from "../shared.js";
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const hex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
async function hash(value) {
  return hex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}
async function password(value, salt = random()) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(value),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return `${salt}:${hex(new Uint8Array(bits))}`;
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function onRequest({ request, env }) {
  const url = new URL(request.url),
    path = url.pathname.replace("/api/", ""),
    db = env.DB,
    now = Date.now();
  if (!db)
    return json(
      {
        error:
          "Database is not connected. Add the Cloudflare D1 binding named DB and initialize it.",
      },
      503,
    );
  if (!["GET", "POST"].includes(request.method))
    return json({ error: "Method not allowed" }, 405);
  if (request.method === "POST" && request.headers.get("Origin") !== url.origin)
    return json({ error: "Invalid request origin" }, 403);
  try {
    const query = (sql, ...args) => db.prepare(sql).bind(...args);
    if (path === "accounts" && request.method === "GET") {
      const { results } = await query(
        "SELECT id,name,password IS NOT NULL AS registered FROM users ORDER BY id",
      ).all();
      return json(results);
    }
    if (path === "login" && request.method === "POST") {
      const body = await request.json();
      if (
        typeof body.password !== "string" ||
        body.password.length < 8 ||
        body.password.length > 128
      )
        return json({ error: "Use a password of 8–128 characters." }, 400);
      const who = await query(
        "SELECT * FROM users WHERE id=?",
        Number(body.id) || 0,
      ).first();
      if (!who) return json({ error: "Choose one of the four accounts." }, 400);
      const key = `login:${request.headers.get("CF-Connecting-IP") || "local"}:${who.id}`;
      await query(
        "INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END",
        key,
        now + 900000,
        now,
        now,
      ).run();
      const attempts = await query(
        "SELECT count FROM attempts WHERE key=?",
        key,
      ).first();
      if (attempts.count > 15)
        return json(
          { error: "Too many attempts. Try again in 15 minutes." },
          429,
        );
      if (!who.password) {
        if (body.setup !== true)
          return json(
            { error: "This account needs a password. Refresh and try again." },
            409,
          );
        const result = await query(
          "UPDATE users SET password=? WHERE id=? AND password IS NULL",
          await password(body.password),
          who.id,
        ).run();
        if (!result.meta.changes)
          return json(
            { error: "Account was already claimed. Please sign in." },
            409,
          );
      } else if (
        !equal(
          await password(body.password, who.password.split(":")[0]),
          who.password,
        )
      )
        return json({ error: "Incorrect password." }, 401);
      await query("DELETE FROM attempts WHERE key=?", key).run();
      const token = random();
      await query(
        "INSERT INTO sessions VALUES(?,?,?)",
        await hash(token),
        who.id,
        now + 30 * 86400000,
      ).run();
      const response = json({ id: who.id, name: who.name, admin: who.admin });
      response.headers.set(
        "Set-Cookie",
        `nba_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`,
      );
      return response;
    }
    const token = request.headers
      .get("Cookie")
      ?.match(/(?:^|;\s*)nba_session=([^;]+)/)?.[1];
    const user = token
      ? await query(
          "SELECT u.id,u.name,u.admin FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
          await hash(token),
          now,
        ).first()
      : null;
    if (!user) return json({ error: "Please sign in." }, 401);
    if (path === "logout" && request.method === "POST") {
      await query(
        "DELETE FROM sessions WHERE token=?",
        await hash(token),
      ).run();
      const response = json({ ok: true });
      response.headers.set(
        "Set-Cookie",
        "nba_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
      );
      return response;
    }
    if (path === "state" && request.method === "GET") {
      const [users, games, picks, predictions, outcomes] = await Promise.all(
        [
          "SELECT id,name FROM users ORDER BY id",
          "SELECT * FROM games ORDER BY tipoff,id",
          "SELECT * FROM picks",
          "SELECT * FROM predictions",
          "SELECT * FROM outcomes",
        ].map((sql) => query(sql).all()),
      );
      return json({
        user,
        users: users.results,
        games: games.results,
        picks: picks.results,
        predictions: predictions.results.map((p) => ({
          ...p,
          value: JSON.parse(p.value),
        })),
        outcomes: outcomes.results.map((p) => ({
          ...p,
          value: JSON.parse(p.value),
        })),
        now,
      });
    }
    if (request.method !== "POST") return json({ error: "Not found" }, 404);
    const body = await request.json();
    if (path === "pick") {
      const result = await query(
        "INSERT INTO picks(user_id,game_id,team,updated) SELECT ?,id,?,? FROM games WHERE id=? AND status='scheduled' AND tipoff>? AND (home=? OR away=?) ON CONFLICT(user_id,game_id) DO UPDATE SET team=excluded.team,updated=excluded.updated",
        user.id,
        body.team,
        now,
        body.game_id,
        now,
        body.team,
        body.team,
      ).run();
      if (!result.meta.changes)
        return json(
          { error: "This game is locked or the selection is invalid." },
          409,
        );
      return json({ ok: true });
    }
    if (path === "prediction") {
      if (!validPrediction(body.category, body.value))
        return json(
          {
            error:
              "Invalid prediction. Teams cannot repeat within a conference.",
          },
          400,
        );
      await query(
        "INSERT INTO predictions VALUES(?,?,?,?) ON CONFLICT(user_id,category) DO UPDATE SET value=excluded.value,updated=excluded.updated",
        user.id,
        body.category,
        JSON.stringify(body.value),
        now,
      ).run();
      return json({ ok: true });
    }
    if (!user.admin) return json({ error: "Admin access required." }, 403);
    if (path === "admin/game") {
      const { id, home, away, status, winner } = body,
        tipoff = Number(body.tipoff);
      if (
        typeof id !== "string" ||
        !id.trim() ||
        id.length > 80 ||
        !TEAMS.includes(home) ||
        !TEAMS.includes(away) ||
        home === away ||
        !Number.isFinite(tipoff) ||
        tipoff < Date.UTC(2026, 6, 1) ||
        tipoff > Date.UTC(2027, 6, 1) ||
        !["scheduled", "postponed", "canceled", "final"].includes(status) ||
        (status === "final" && ![home, away].includes(winner))
      )
        return json(
          { error: "Check the teams, date, status, and winner." },
          400,
        );
      const previous = await query(
        "SELECT * FROM games WHERE id=?",
        id,
      ).first();
      if (previous && (previous.home !== home || previous.away !== away))
        return json(
          {
            error:
              "Teams on an existing game cannot be changed. Cancel it and add the correct matchup.",
          },
          400,
        );
      await query(
        "INSERT INTO games(id,home,away,tipoff,day,status,winner) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET tipoff=excluded.tipoff,day=excluded.day,status=excluded.status,winner=excluded.winner",
        id,
        home,
        away,
        tipoff,
        easternDay(tipoff),
        status,
        status === "final" ? winner : null,
      ).run();
      return json({ ok: true });
    }
    if (path === "admin/outcome") {
      if (!validPrediction(body.category, body.value))
        return json({ error: "Invalid outcome." }, 400);
      await query(
        "INSERT INTO outcomes VALUES(?,?) ON CONFLICT(category) DO UPDATE SET value=excluded.value",
        body.category,
        JSON.stringify(body.value),
      ).run();
      return json({ ok: true });
    }
    if (path === "admin/reset") {
      const id = Number(body.id);
      if (![2, 3, 4].includes(id))
        return json({ error: "Only friend accounts can be reset here." }, 400);
      await db.batch([
        query("UPDATE users SET password=NULL WHERE id=?", id),
        query("DELETE FROM sessions WHERE user_id=?", id),
      ]);
      return json({ ok: true });
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error(error);
    return json(
      {
        error: "Request failed. Check that the database has been initialized.",
      },
      500,
    );
  }
}
