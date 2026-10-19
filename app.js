import {
  AWARDS,
  EAST,
  WEST,
  TEAMS,
  NAMES,
  IDS,
  easternDay,
  canPick,
  standings,
} from "./shared.js";
const $ = (s) => document.querySelector(s),
  app = $("#app");
let state,
  day = easternDay(),
  offset = 0,
  busy = false;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const clock = (ms) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(ms);
const stamp = (ms) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(ms);
const logo = (t) =>
  `<img class="logo" alt="" src="https://cdn.nba.com/logos/nba/${IDS[t]}/primary/L/logo.svg">`;
const options = (teams, value) =>
  `<option value="">—</option>` +
  teams
    .map(
      (t) =>
        `<option value="${t}" ${value === t ? "selected" : ""}>${t} · ${NAMES[t]}</option>`,
    )
    .join("");
function notice(message) {
  $("#notice").textContent = message;
  $("#notice").className = "show";
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => ($("#notice").className = ""), 4500);
}
async function api(path, body) {
  const response = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let value;
  try {
    value = await response.json();
  } catch {
    throw Error(
      "The API is unavailable. Check your Pages Functions deployment.",
    );
  }
  if (!response.ok) {
    const e = Error(value.error || "Request failed");
    e.status = response.status;
    throw e;
  }
  return value;
}
async function load(renderPage = true) {
  state = await api("state");
  offset = state.now - Date.now();
  if (renderPage) render();
}
async function start() {
  try {
    await load();
  } catch (e) {
    if (e.status === 401) await login();
    else
      app.innerHTML = `<main><h1>NBA Picks</h1><div class="panel pad"><p class="error">${esc(e.message)}</p><p class="muted">The site is deployed. Its database and Functions need to be ready before you can sign in.</p><button id="retry">Try again</button></div></main>`;
    $("#retry")?.addEventListener("click", start);
  }
}
async function login() {
  state = null;
  let accounts;
  try {
    accounts = await api("accounts");
  } catch (e) {
    app.innerHTML = `<main><p class="error">${esc(e.message)}</p></main>`;
    return;
  }
  app.innerHTML = `<main class="login"><div class="brand">NBA Picks <span>2026–27 · Regular season</span></div><h1>Welcome to the season.</h1><p class="muted">Four friends. Every game. Make your call.</p><form id="login"><label>Your name<select name="id">${accounts.map((a) => `<option value="${a.id}">${a.name}</option>`).join("")}</select></label><label>Password<input name="password" type="password" minlength="8" maxlength="128" required autocomplete="current-password"></label><label id="confirm-label" hidden>Confirm password<input name="confirm" type="password" minlength="8" autocomplete="new-password"></label><p id="login-help" class="subtext"></p><p class="error" id="login-error" role="alert"></p><button class="primary" id="login-submit">Sign in</button></form><p class="subtext">Private league · All game times in Eastern Time</p></main>`;
  const form = $("#login");
  function mode() {
    const fresh = !accounts.find((a) => a.id === Number(form.elements.id.value))
      .registered;
    $("#login-help").textContent = fresh
      ? "First visit? Set a password to claim your name. Please only select your own account."
      : "Forgot your password? Ask Amit to reset your account.";
    $("#login-submit").textContent = fresh ? "Set password & join" : "Sign in";
    $("#confirm-label").hidden = !fresh;
    form.elements.confirm.required = fresh;
    form.elements.password.autocomplete = fresh
      ? "new-password"
      : "current-password";
    return fresh;
  }
  form.elements.id.onchange = mode;
  mode();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const setup = mode();
    if (setup && form.elements.password.value !== form.elements.confirm.value) {
      $("#login-error").textContent = "Passwords do not match.";
      return;
    }
    $("#login-submit").disabled = true;
    try {
      await api("login", {
        id: Number(form.elements.id.value),
        password: form.elements.password.value,
        setup,
      });
      await load();
    } catch (e) {
      $("#login-error").textContent = e.message;
      $("#login-submit").disabled = false;
    }
  };
}
const route = () => location.hash.slice(1) || "games";
function render() {
  if (!state) return;
  const page = route(),
    tabs = [
      ["games", "Games"],
      ["accuracy", "Accuracy"],
      ["awards", "Awards"],
      ["season", "Season"],
      ...(state.user.admin ? [["admin", "Admin"]] : []),
    ];
  app.innerHTML = `<header><div class="bar"><div class="brand">NBA Picks<span>2026–27 · Regular season</span></div><div class="row"><span class="small">${state.user.name}</span><button class="linkbutton small" id="logout">Sign out</button></div></div><nav>${tabs.map(([id, name]) => `<a href="#${id}" class="${page === id ? "active" : ""}" ${page === id ? 'aria-current="page"' : ""}>${name}</a>`).join("")}</nav></header><main id="content"></main>`;
  $("#logout").onclick = async () => {
    try {
      await api("logout", {});
      await login();
    } catch (e) {
      notice(e.message);
    }
  };
  if (page === "accuracy") accuracy();
  else if (page === "awards") awards();
  else if (page === "season") season();
  else if (page === "admin" && state.user.admin) admin();
  else games();
}
function games() {
  const list = state.games.filter((g) => g.day === day),
    now = Date.now() + offset,
    remaining = list.filter(
      (g) =>
        canPick(g, now) &&
        !state.picks.some(
          (p) => p.user_id === state.user.id && p.game_id === g.id,
        ),
    ).length;
  $("#content").innerHTML =
    `<div class="heading"><div><h1>Daily picks</h1><p class="muted">Everyone’s picks, side by side.</p></div><div class="toolbar"><button id="prev" aria-label="Previous day">←</button><input type="date" id="date" aria-label="Game date" value="${day}"><button id="next" aria-label="Next day">→</button><button id="today">Today</button></div></div><section class="panel"><div class="paneltop"><h2>${new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"))}</h2><span class="subtext">${remaining ? `${remaining} pick${remaining === 1 ? "" : "s"} left` : "All available picks made"} · Eastern Time</span></div>${
      list.length
        ? `<table><thead><tr><th>Matchup</th>${state.users.map((u) => `<th class="${u.id === state.user.id ? "mine" : ""}">${u.name}${u.id === state.user.id ? " · You" : ""}</th>`).join("")}</tr></thead><tbody>${list
            .map(
              (g) =>
                `<tr><td><div class="matchup"><div class="teamline">${logo(g.away)}${g.away}</div><div class="teamline">${logo(g.home)}${g.home}</div></div><div class="subtext">${g.status === "final" ? `Final · ${g.winner} won` : g.status !== "scheduled" ? esc(g.status) : `${clock(g.tipoff)}${canPick(g, now) ? "" : " · Locked"}`}</div></td>${state.users
                  .map((u) => {
                    const p = state.picks.find(
                      (p) => p.user_id === u.id && p.game_id === g.id,
                    );
                    return `<td class="${u.id === state.user.id ? "mine" : ""}">${u.id === state.user.id && canPick(g, now) ? `<div class="pickbuttons">${[g.away, g.home].map((t) => `<button data-game="${esc(g.id)}" data-team="${t}" class="${p?.team === t ? "selected" : ""}" aria-label="Pick ${NAMES[t]}" aria-pressed="${p?.team === t}">${t}</button>`).join("")}</div>` : `<span class="pill ${g.status === "final" ? (p?.team === g.winner ? "good" : "bad") : "neutral"}">${p ? logo(p.team) : ""}${p?.team || (g.status === "final" ? "Miss" : "—")}${g.status === "final" ? (p?.team === g.winner ? " ✓" : " ×") : ""}</span>`}</td>`;
                  })
                  .join("")}</tr>`,
            )
            .join("")}</tbody></table>`
        : `<div class="empty">${state.games.length ? "No games scheduled for this day." : "The season schedule hasn’t been imported yet."}</div>`
    }</section><div class="summary">${standings(state.users, list, state.picks)
      .map(
        (u) =>
          `<span>${u.name} <strong>${u.correct}/${u.total}</strong></span>`,
      )
      .join(
        "",
      )}</div><p class="subtext">Picks save individually and lock at tip-off. Missed picks count as incorrect when a result is entered.</p>`;
  $("#date").onchange = (e) => {
    if (e.target.value) {
      day = e.target.value;
      games();
    }
  };
  for (const [id, delta] of [
    ["prev", -1],
    ["next", 1],
  ])
    $("#" + id).onclick = () => {
      const d = new Date(day + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + delta);
      day = d.toISOString().slice(0, 10);
      games();
    };
  $("#today").onclick = () => {
    day = easternDay();
    games();
  };
  document
    .querySelectorAll("[data-game]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          mutate(
            "pick",
            { game_id: b.dataset.game, team: b.dataset.team },
            "Pick saved",
          )),
    );
}
async function mutate(path, data, message = "Saved") {
  if (busy) return;
  busy = true;
  document
    .querySelectorAll("button,input,select")
    .forEach((e) => (e.disabled = true));
  try {
    await api(path, data);
    await load();
    notice(message);
  } catch (e) {
    notice(e.message);
    try {
      await load();
    } catch {
      render();
    }
  } finally {
    busy = false;
  }
}
function accuracy() {
  $("#content").innerHTML =
    `<div class="heading"><div><h1>Season accuracy</h1><p class="muted">Every finalized regular-season game counts.</p></div></div><div class="panel"><table><thead><tr><th>Player</th><th>Accuracy</th><th>Correct</th><th>Games</th><th>Missed</th></tr></thead><tbody>${standings(
      state.users,
      state.games,
      state.picks,
    )
      .map(
        (u, i) =>
          `<tr><td><span class="rank">${i + 1}</span><strong>${u.name}</strong></td><td><span class="stat">${u.accuracy === null ? "—" : (u.accuracy * 100).toFixed(1) + "%"}</span></td><td>${u.correct}</td><td>${u.total}</td><td>${u.missed}</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table></div><p class="subtext">Accuracy = correct picks ÷ finalized games. Missed picks are incorrect; postponed and canceled games are excluded. Equal accuracies are tied.</p>`;
}
function pred(user, category) {
  return state.predictions.find(
    (p) => p.user_id === user && p.category === category,
  );
}
function predCell(u, category, teams, index) {
  const p = pred(u.id, category),
    value = index === undefined ? p?.value : p?.value?.[index],
    outcome = state.outcomes.find((o) => o.category === category),
    actual = index === undefined ? outcome?.value : outcome?.value?.[index];
  return `<td class="${u.id === state.user.id ? "mine" : ""}">${u.id === state.user.id ? (teams ? `<select aria-label="${esc(category)} ${index === undefined ? "" : index + 1}" data-category="${category}" ${index === undefined ? "" : `data-index="${index}"`}>${options(teams, value)}</select>` : `<input aria-label="${esc(category)} prediction" data-category="${category}" value="${esc(value)}" placeholder="Enter name" maxlength="100">`) : `<span class="${actual && value ? "pill " + (value === actual ? "good" : "bad") : ""}">${esc(value || "—")}${actual && value ? (value === actual ? " ✓" : " ×") : ""}</span>`}${p ? `<span class="stamp">${stamp(p.updated)}</span>` : ""}</td>`;
}
function predHead(label) {
  return `<thead><tr><th>${label}</th>${state.users.map((u) => `<th class="${u.id === state.user.id ? "mine" : ""}">${u.name}${u.id === state.user.id ? " · You" : ""}</th>`).join("")}</tr></thead>`;
}
function wirePredictions() {
  document.querySelectorAll("[data-category]").forEach(
    (input) =>
      (input.onchange = () => {
        let value = input.value.trim();
        if (input.dataset.index !== undefined) {
          value = [
            ...(pred(state.user.id, input.dataset.category)?.value ||
              Array(10).fill("")),
          ];
          value[Number(input.dataset.index)] = input.value;
          if (!value.every((v, i) => !v || value.indexOf(v) === i)) {
            notice(
              "Each team can appear only once per conference. Clear its other slot first.",
            );
            render();
            return;
          }
        }
        mutate("prediction", { category: input.dataset.category, value });
      }),
  );
}
function awards() {
  $("#content").innerHTML =
    `<div class="intro"><h1>Awards</h1><p class="muted">Your season-long calls. Editable anytime, on trust.</p><p class="subtext">Enter the player, coach, or executive’s full name. Changes save when you leave a field.</p><p class="subtext tablehint">Swipe across to compare everyone’s predictions.</p></div><div class="panel tablewrap"><table class="prediction-table">${predHead("Award")}<tbody>${AWARDS.map((a) => `<tr><td><strong>${a}</strong>${state.outcomes.find((o) => o.category === a)?.value ? `<span class="outcome">Winner: ${esc(state.outcomes.find((o) => o.category === a).value)}</span>` : ""}</td>${state.users.map((u) => predCell(u, a)).join("")}</tr>`).join("")}</tbody></table></div>`;
  wirePredictions();
}
function season() {
  $("#content").innerHTML =
    `<div class="intro"><h1>Season predictions</h1><p class="muted">Regular-season finishes and playoff champions. Editable anytime.</p><p class="subtext tablehint">Swipe across to compare everyone’s predictions.</p></div>${[
      ["east", "Eastern Conference", EAST],
      ["west", "Western Conference", WEST],
    ]
      .map(
        ([key, title, teams]) =>
          `<section class="panel"><div class="paneltop"><h2>${title}</h2><span class="subtext">Regular-season positions · Before the play-in</span></div><div class="tablewrap"><table class="prediction-table">${predHead("Seed")}<tbody>${Array.from({ length: 10 }, (_, i) => `<tr><td><strong>${i + 1}</strong>${state.outcomes.find((o) => o.category === key)?.value?.[i] ? `<span class="outcome">Actual: ${state.outcomes.find((o) => o.category === key).value[i]}</span>` : ""}</td>${state.users.map((u) => predCell(u, key, teams, i)).join("")}</tr>`).join("")}</tbody></table></div></section>`,
      )
      .join(
        "",
      )}<section class="panel"><div class="paneltop"><h2>Champions</h2><span class="subtext">Playoff winners</span></div><div class="tablewrap"><table class="prediction-table">${predHead("Title")}<tbody>${[
      ["east_champ", "East", EAST],
      ["west_champ", "West", WEST],
      ["champ", "NBA", TEAMS],
    ]
      .map(
        ([key, title, teams]) =>
          `<tr><td>${title}${state.outcomes.find((o) => o.category === key)?.value ? `<span class="outcome">Winner: ${state.outcomes.find((o) => o.category === key).value}</span>` : ""}</td>${state.users.map((u) => predCell(u, key, teams)).join("")}</tr>`,
      )
      .join(
        "",
      )}</tbody></table></div></section><p class="subtext">A playoff bracket will be added after the regular season. These predictions do not affect game accuracy.</p>`;
  wirePredictions();
}
function easternInput(ms) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ms);
  return parts.replace(" ", "T");
}
function fromEastern(value) {
  const base = Date.parse(value + "Z");
  let guess = base;
  for (let i = 0; i < 3; i++) {
    const rendered = Date.parse(easternInput(guess) + "Z");
    guess += base - rendered;
  }
  return guess;
}
function admin() {
  const g = state.games.find((g) => g.id === admin.selected);
  $("#content").innerHTML =
    `<div class="intro"><h1>League admin</h1><p class="muted">Results and schedule changes update everyone’s view.</p></div><section class="panel pad"><h2>Game results & schedule</h2><label>Choose a game<select id="edit-game"><option value="">Add a game</option>${state.games.map((x) => `<option value="${esc(x.id)}" ${g?.id === x.id ? "selected" : ""}>${x.day} · ${x.away} at ${x.home}${x.status === "final" ? " · Final" : ""}</option>`).join("")}</select></label><form id="game-form" class="formgrid"><label>Game ID<input name="id" value="${esc(g?.id || "")}" ${g ? "readonly" : ""} required placeholder="NBA game ID"></label><label>Away team<select name="away" required ${g ? "disabled" : ""}>${options(TEAMS, g?.away)}</select></label><label>Home team<select name="home" required ${g ? "disabled" : ""}>${options(TEAMS, g?.home)}</select></label><label>Tip-off · Eastern Time<input type="datetime-local" name="tipoff" required value="${g ? easternInput(g.tipoff) : ""}"></label><label>Status<select name="status">${["scheduled", "postponed", "canceled", "final"].map((s) => `<option ${g?.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>Winner (for final games)<select name="winner">${options(g ? [g.away, g.home] : TEAMS, g?.winner)}</select></label><div class="wide"><button class="primary">Save game</button><p class="subtext">Moving tip-off into the future reopens picks. Postponed games stay locked until you mark them scheduled with a new time.</p></div></form></section><section class="panel pad"><h2>Award winners & champions</h2><div class="outcomes">${[...AWARDS, "east_champ", "west_champ", "champ"].map((key) => `<form data-outcome="${key}"><label>${key.replace("_champ", " champion")}<input name="value" value="${esc(state.outcomes.find((o) => o.category === key)?.value || "")}" maxlength="100" placeholder="${key.includes("champ") ? "Team code, e.g. BOS" : "Full name"}"></label><button>Save</button></form>`).join("")}</div><p class="subtext">Use the same spelling as predictions to mark award matches.</p></section><section class="panel pad"><h2>Final conference positions</h2><div class="outcomes">${["east", "west"].map((key) => `<form data-seeds="${key}"><label>${key === "east" ? "East" : "West"} · Seeds 1–10<input name="value" placeholder="BOS, NYK, …" value="${esc(state.outcomes.find((o) => o.category === key)?.value?.join(", ") || "")}"></label><button>Save</button></form>`).join("")}</div><p class="subtext">Enter ten unique team codes, separated by commas.</p></section><section class="panel pad"><h2>Reset a friend’s password</h2><p class="subtext">This signs them out and allows them to set a new password. Their picks stay saved.</p><div class="row">${state.users
      .filter((u) => u.id !== 1)
      .map((u) => `<button data-reset="${u.id}">${u.name}</button>`)
      .join("")}</div></section>`;
  $("#edit-game").onchange = (e) => {
    admin.selected = e.target.value;
    admin();
  };
  $("#game-form").onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget.elements;
    mutate(
      "admin/game",
      {
        id: f.id.value,
        away: g?.away || f.away.value,
        home: g?.home || f.home.value,
        tipoff: fromEastern(f.tipoff.value),
        status: f.status.value,
        winner: f.winner.value,
      },
      "Game updated",
    );
  };
  document.querySelectorAll("[data-outcome]").forEach(
    (f) =>
      (f.onsubmit = (e) => {
        e.preventDefault();
        mutate("admin/outcome", {
          category: f.dataset.outcome,
          value: f.elements.value.value.trim(),
        });
      }),
  );
  document.querySelectorAll("[data-seeds]").forEach(
    (f) =>
      (f.onsubmit = (e) => {
        e.preventDefault();
        mutate("admin/outcome", {
          category: f.dataset.seeds,
          value: f.elements.value.value
            .split(",")
            .map((v) => v.trim().toUpperCase()),
        });
      }),
  );
  document.querySelectorAll("[data-reset]").forEach(
    (b) =>
      (b.onclick = () => {
        if (confirm(`Reset ${b.textContent}’s password?`))
          mutate(
            "admin/reset",
            { id: Number(b.dataset.reset) },
            "Password reset",
          );
      }),
  );
}
window.addEventListener("hashchange", () => {
  if (!busy) render();
});
setInterval(async () => {
  if (
    !state ||
    busy ||
    document.hidden ||
    !["games", "accuracy"].includes(route())
  )
    return;
  const active = document.activeElement;
  if (active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName))
    return;
  try {
    await load();
  } catch (e) {
    if (e.status === 401) await login();
  }
}, 30000);
start();
