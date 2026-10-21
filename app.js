import {
  normalizeName,
  canonicalAwardName,
  searchAwardCandidates,
} from "./award-directory.js";
import {
  seasonPredictionsLocked,
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
    throw Error("The app is temporarily unavailable. Please try again.");
  }
  if (!response.ok) {
    const e = Error(value.error || "Request failed");
    e.status = response.status;
    e.code = value.code;
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
let returnPage = "games";
async function login() {
  closePersonPicker();
  let accounts;
  try {
    accounts = await api("accounts");
  } catch (e) {
    app.innerHTML = `<main><p class="error">${esc(e.message)}</p></main>`;
    return;
  }
  app.innerHTML = `<main class="login"><div class="brand">NBA<span class="slash">/</span>PICKS<span class="season-label">2026–27 · REGULAR SEASON</span></div><h1>Sign in</h1><form id="login"><label>Your name<select name="id">${accounts.map((a) => `<option value="${a.id}">${a.name}</option>`).join("")}</select></label><label>Password<input name="password" type="password" minlength="8" maxlength="128" required autocomplete="current-password"></label><label id="confirm-label" hidden>Confirm password<input name="confirm" type="password" minlength="8" autocomplete="new-password"></label><p id="login-help" class="subtext"></p><p class="error" id="login-error" role="alert"></p><button class="primary" id="login-submit">Sign in</button></form><p><a class="linkbutton" id="back-viewing" href="#${returnPage}">Back to viewing</a></p></main>`;
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
    let accepted = false;
    try {
      await api("login", {
        id: Number(form.elements.id.value),
        password: form.elements.password.value,
        setup,
      });
      accepted = true;
      accounts.find((a) => a.id === Number(form.elements.id.value)).registered =
        1;
      mode();
      await load(false);
      if (!state.user) throw Object.assign(Error("Please sign in."), { status: 401 });
      history.replaceState(null, "", "#" + returnPage);
      render();
    } catch (e) {
      if (e.code === "SETUP_REQUIRED") {
        accounts.find(
          (a) => a.id === Number(form.elements.id.value),
        ).registered = 0;
        mode();
        form.elements.confirm.value = "";
        form.elements.confirm.focus();
      }
      $("#login-error").textContent =
        accepted && e.status === 401
          ? "Your password was accepted, but your browser did not keep you signed in. Open https://nba.amitsai.com in Safari or Chrome, allow cookies, and sign in with the password you just set. You do not need another reset."
          : e.message;
      $("#login-submit").disabled = false;
    }
  };
}
const route = () => location.hash.slice(1) || "games";
function render() {
  if (!state) return;
  closePersonPicker();
  if (route() === "login") { login(); return; }
  const page = route(),
    tabs = [
      ["games", "Games"],
      ["accuracy", "Accuracy"],
      ["awards", "Awards"],
      ["season", "Season"],
      ["bracket", "Bracket"],
      ...(state.user?.admin ? [["admin", "Admin"]] : []),
    ];
  app.innerHTML = `<header><div class="bar"><div class="brand">NBA<span class="slash">/</span>PICKS<span class="season-label">2026–27 · REGULAR SEASON</span></div><div class="row">${state.user ? `<span class="small">${state.user.name}</span><button class="linkbutton small" id="logout">Sign out</button>` : `<span class="small muted">View only</span><a class="linkbutton small" id="signin" href="#login">Sign in</a>`}</div></div><nav>${tabs.map(([id, name]) => `<a href="#${id}" class="${page === id ? "active" : ""}" ${page === id ? 'aria-current="page"' : ""}>${name}</a>`).join("")}</nav></header><main id="content"></main>`;
  $("#signin")?.addEventListener("click", () => { returnPage = route(); });
  if ($("#logout")) $("#logout").onclick = async () => {
    try {
      await api("logout", {});
      if (route() === "admin") history.replaceState(null, "", "#games");
      await load();
    } catch (e) {
      notice(e.message);
    }
  };
  if (page === "accuracy") accuracy();
  else if (page === "awards") awards();
  else if (page === "season") season();
  else if (page === "bracket") bracket();
  else if (page === "admin" && state.user?.admin) admin();
  else games();
}
function games() {
  const list = state.games.filter((g) => g.day === day),
    now = Date.now() + offset;
  const remaining = list.filter(
    (g) =>
      canPick(g, now) &&
      !state.picks.some(
        (p) => p.user_id === state.user?.id && p.game_id === g.id,
      ),
  ).length;
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
  $("#content").innerHTML =
    `<div class="heading"><div><h1>${dateLabel}</h1></div><div class="toolbar"><button id="prev" aria-label="Previous day">←</button><input type="date" id="date" aria-label="Game date" value="${day}"><button id="next" aria-label="Next day">→</button><button id="today">Today</button></div></div>${state.user ? `<div class="meta"><strong>${remaining} ${remaining === 1 ? "pick" : "picks"} left</strong></div>` : ""}<section class="panel">${
      list.length
        ? `<table class="games-table">${predHead("Matchup")}<tbody>${list
            .map(
              (g) =>
                `<tr><td><div class="matchup"><div class="teamline">${logo(g.away)}${g.away}</div><span class="at">at</span><div class="teamline">${logo(g.home)}${g.home}</div></div><div class="gametime">${g.status === "final" ? `Final · ${g.winner} won` : g.status !== "scheduled" ? esc(g.status) : `${clock(g.tipoff)} ET${canPick(g, now) ? "" : " · Locked"}`}</div></td>${state.users
                  .map((u) => {
                    const p = state.picks.find(
                      (p) => p.user_id === u.id && p.game_id === g.id,
                    );
                    return `<td class="${u.id === state.user?.id ? "mine" : ""}">${u.id === state.user?.id && canPick(g, now) ? `<div class="pickbuttons">${[g.away, g.home].map((t) => `<button data-game="${esc(g.id)}" data-team="${t}" class="${p?.team === t ? "selected" : ""}" aria-label="Pick ${NAMES[t]}" aria-pressed="${p?.team === t}">${t}</button>`).join("")}</div>` : `<span class="pill ${g.status === "final" ? (p?.team === g.winner ? "good" : "bad") : "neutral"}" ${g.status === "final" ? `aria-label="${p?.team || "Missed pick"}: ${p?.team === g.winner ? "correct" : "incorrect"}"` : ""}>${p?.team || "—"}${g.status === "final" ? (p?.team === g.winner ? " ✓" : " ×") : ""}</span>`}</td>`;
                  })
                  .join("")}</tr>`,
            )
            .join("")}</tbody></table>`
        : `<div class="empty">${state.games.length ? "No games scheduled for this day." : "The season schedule hasn’t been imported yet."}</div>`
    }</section>`;
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
  const rows = standings(state.users, state.games, state.picks);
  const finalized = state.games.filter((g) => g.status === "final").length;
  $("#content").innerHTML =
    `<div class="heading"><div><h1>Accuracy</h1></div></div><div class="meta left">${finalized} / 1230 games finalized</div><section class="panel"><table class="accuracy-table"><thead><tr><th>Player</th><th>Accuracy</th><th>Correct</th></tr></thead><tbody>${rows.map((u) => `<tr class="${u.id === state.user?.id ? "mine" : ""}"><td>${u.name}</td><td><span class="stat">${u.accuracy === null ? "—" : (u.accuracy * 100).toFixed(1) + "%"}</span></td><td class="record">${u.correct}<span class="muted"> / ${u.total}</span></td></tr>`).join("")}</tbody></table></section>`;
}
function pred(user, category) {
  return state.predictions.find(
    (p) => p.user_id === user && p.category === category,
  );
}
function predCell(u, category, teams, index) {
  const p = pred(u.id, category),
    value = index === undefined ? p?.value : p?.value?.[index];
  const outcome = state.outcomes.find((o) => o.category === category),
    actual = index === undefined ? outcome?.value : outcome?.value?.[index];
  const match =
    actual && value && normalizeName(value) === normalizeName(actual);
  const updated = p ? ` title="Updated ${stamp(p.updated)} ET"` : "";
  let content;
  if (u.id === state.user?.id && !seasonPredictionsLocked(Date.now() + offset)) {
    if (teams) {
      const available = teams.filter(
        (t) =>
          !["east", "west"].includes(category) ||
          t === value ||
          !(p?.value || []).includes(t),
      );
      content = `<div class="team-select">${value ? logo(value) : ""}<select aria-label="${esc(category)} ${index === undefined ? "" : index + 1}" data-category="${category}" ${index === undefined ? "" : `data-index="${index}"`}${updated}><option value="">—</option>${available.map((t) => `<option value="${t}" ${t === value ? "selected" : ""}>${t}</option>`).join("")}</select></div>`;
    } else if (category === "EOTY")
      content = `<input aria-label="Executive of the Year prediction" data-category="EOTY" value="${esc(value)}" placeholder="Name" maxlength="100"${updated}>`;
    else
      content = `<button class="award-choice ${value ? "" : "empty-choice"}" data-award="${category}" aria-label="Choose ${category}: ${esc(value || "no selection")}" aria-haspopup="dialog" aria-expanded="false"${updated}><span>${esc(value || "Select")}</span><span class="chevron" aria-hidden="true">⌄</span></button>`;
  } else
    content = `<span class="${teams ? "team-value" : "person-value"} ${actual && value ? (match ? "good" : "bad") : ""}"${updated}>${teams && value ? logo(value) : ""}<span>${esc(value || "—")}${actual && value ? (match ? " ✓" : " ×") : ""}</span></span>`;
  return `<td class="${u.id === state.user?.id ? "mine" : ""}">${content}</td>`;
}
function predHead(label) {
  return `<thead><tr><th>${label}</th>${state.users.map((u) => `<th class="${u.id === state.user?.id ? "mine" : ""}">${u.name}${u.id === state.user?.id ? '<span class="you">YOU</span>' : ""}</th>`).join("")}</tr></thead>`;
}
let closePersonPicker = () => {};
function openPersonPicker(button) {
  closePersonPicker();
  const category = button.dataset.award;
  const popup = document.createElement("div");
  popup.className = "person-picker";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", `Choose ${category}`);
  popup.innerHTML = `<div class="picker-top"><span>${category}</span><button class="picker-close" aria-label="Close selector">×</button></div><input type="search" aria-label="Search ${category === "COTY" ? "coaches" : "players"}" placeholder="Search ${category === "COTY" ? "coaches" : "players"}…" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="award-results" autocomplete="off"><div id="award-results" class="picker-results" role="listbox" aria-label="Suggestions"></div><button class="picker-clear">Clear selection</button>`;
  document.body.append(popup);
  button.setAttribute("aria-expanded", "true");
  const input = popup.querySelector("input"),
    results = popup.querySelector(".picker-results");
  let matches = [],
    active = -1;
  const rect = button.getBoundingClientRect();
  const width = Math.min(360, innerWidth - 24);
  popup.style.width = width + "px";
  popup.style.left =
    Math.max(12, Math.min(rect.left, innerWidth - width - 12)) + "px";
  const availableBelow = innerHeight - rect.bottom - 12;
  if (availableBelow >= 250) popup.style.top = rect.bottom + 5 + "px";
  else popup.style.top = Math.max(12, rect.top - 360) + "px";
  popup.style.maxHeight = innerHeight - 24 + "px";
  popup.style.overflowY = "auto";
  function highlight() {
    results
      .querySelectorAll("[role=option]")
      .forEach((el, i) =>
        el.setAttribute("aria-selected", String(i === active)),
      );
    if (active >= 0) {
      input.setAttribute("aria-activedescendant", `candidate-${active}`);
      results.children[active]?.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }
  function choose(value) {
    closePersonPicker();
    mutate("prediction", { category, value });
  }
  function suggestions() {
    matches = searchAwardCandidates(category, input.value);
    active = -1;
    results.innerHTML = matches.length
      ? matches
          .map(
            (p, i) =>
              `<button type="button" role="option" id="candidate-${i}" aria-selected="false" class="person-option">${esc(p.name)}<span>${esc(p.team)}</span></button>`,
          )
          .join("")
      : '<div class="picker-empty">No matching names</div>';
    results
      .querySelectorAll("button")
      .forEach((b, i) => (b.onclick = () => choose(matches[i].name)));
    highlight();
  }
  const outside = (e) => {
    if (!popup.contains(e.target) && !button.contains(e.target))
      closePersonPicker();
  };
  closePersonPicker = () => {
    popup.remove();
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside);
    closePersonPicker = () => {};
  };
  document.addEventListener("pointerdown", outside);
  popup.querySelector(".picker-close").onclick = () => {
    closePersonPicker();
    button.focus();
  };
  popup.querySelector(".picker-clear").onclick = () => choose("");
  input.oninput = suggestions;
  input.onkeydown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = matches.length
        ? (active + (e.key === "ArrowDown" ? 1 : -1) + matches.length) %
          matches.length
        : -1;
      highlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[active]) choose(matches[active].name);
      else {
        const name = canonicalAwardName(category, input.value);
        if (name) choose(name);
      }
    }
  };
  popup.onkeydown = (e) => {
    if (e.key === "Escape") {
      closePersonPicker();
      button.focus();
    }
  };
  suggestions();
  input.focus();
}
function wirePredictions() {
  document
    .querySelectorAll("[data-award]")
    .forEach((b) => (b.onclick = () => openPersonPicker(b)));
  document.querySelectorAll("[data-category]").forEach(
    (input) =>
      (input.onchange = () => {
        let value = input.value.trim();
        if (input.dataset.index !== undefined) {
          value = [
            ...(pred(state.user?.id, input.dataset.category)?.value ||
              Array(10).fill("")),
          ];
          value[Number(input.dataset.index)] = input.value;
          if (!value.every((v, i) => !v || value.indexOf(v) === i)) {
            notice("Each team can appear only once per conference.");
            render();
            return;
          }
        }
        mutate("prediction", { category: input.dataset.category, value });
      }),
  );
}
function deadlineCaption() {
  return `<p class="subtext">${seasonPredictionsLocked(Date.now() + offset) ? "Locked · Oct 21, 2026 at 7:00 PM ET" : "Picks lock Oct 21, 2026 at 7:00 PM ET"}</p>`;
}
function bracket() {
  $("#content").innerHTML = `<div class="intro"><h1>Bracket</h1></div><section class="bracket-locked"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg><h2>Locked</h2><p>Will open once the regular season is completed.</p></section>`;
}
function awards() {
  $("#content").innerHTML =
    `<div class="intro"><h1>Awards</h1>${deadlineCaption()}</div><section class="panel"><table class="prediction-table awards-table">${predHead("Award")}<tbody>${AWARDS.map((a) => `<tr><td><strong>${a}</strong>${state.outcomes.find((o) => o.category === a)?.value ? `<span class="outcome">Winner: ${esc(state.outcomes.find((o) => o.category === a).value)}</span>` : ""}</td>${state.users.map((u) => predCell(u, a)).join("")}</tr>`).join("")}</tbody></table></section>`;
  wirePredictions();
}
function season() {
  $("#content").innerHTML =
    `<div class="intro"><h1>Standings & titles</h1>${deadlineCaption()}</div>${[
      ["east", "Eastern Conference", EAST],
      ["west", "Western Conference", WEST],
    ]
      .map(
        ([key, title, teams]) =>
          `<section class="panel"><div class="paneltop"><h2>${title}</h2></div><table class="prediction-table standings-table">${predHead("Seed")}<tbody>${Array.from({ length: 10 }, (_, i) => `<tr><td class="numbers">${String(i + 1).padStart(2, "0")}${state.outcomes.find((o) => o.category === key)?.value?.[i] ? `<span class="outcome">Actual: ${state.outcomes.find((o) => o.category === key).value[i]}</span>` : ""}</td>${state.users.map((u) => predCell(u, key, teams, i)).join("")}</tr>`).join("")}</tbody></table></section>`,
      )
      .join(
        "",
      )}<section class="panel"><div class="paneltop"><h2>Champions</h2></div><table class="prediction-table standings-table">${predHead("Title")}<tbody>${[
      ["east_champ", "East", EAST],
      ["west_champ", "West", WEST],
      ["champ", "NBA", TEAMS],
    ]
      .map(
        ([key, title, teams]) =>
          `<tr><td>${title}${state.outcomes.find((o) => o.category === key)?.value ? `<span class="outcome">Winner: ${state.outcomes.find((o) => o.category === key).value}</span>` : ""}</td>${state.users.map((u) => predCell(u, key, teams)).join("")}</tr>`,
      )
      .join("")}</tbody></table></section>`;
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
    !["games", "accuracy", "awards", "season"].includes(route())
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
