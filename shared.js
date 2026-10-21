// October 21, 2026 at 7:00 PM Eastern (EDT).
export const SEASON_DEADLINE = Date.parse("2026-10-21T19:00:00-04:00");
export const seasonPredictionsLocked = (now = Date.now()) => now >= SEASON_DEADLINE;
export const PEOPLE = ["Amit", "Amol", "Garv", "Praneeth", "Daniel"];
export const AWARDS = [
  "MVP",
  "DPOY",
  "ROTY",
  "6MOTY",
  "MIP",
  "CPOTY",
  "COTY",
  "EOTY",
  "FMVP",
];
export const EAST = [
  "ATL",
  "BOS",
  "BKN",
  "CHA",
  "CHI",
  "CLE",
  "DET",
  "IND",
  "MIA",
  "MIL",
  "NYK",
  "ORL",
  "PHI",
  "TOR",
  "WAS",
];
export const WEST = [
  "DAL",
  "DEN",
  "GSW",
  "HOU",
  "LAC",
  "LAL",
  "MEM",
  "MIN",
  "NOP",
  "OKC",
  "PHX",
  "POR",
  "SAC",
  "SAS",
  "UTA",
];
export const TEAMS = [...EAST, ...WEST].sort();
export const NAMES = {
  ATL: "Atlanta Hawks",
  BOS: "Boston Celtics",
  BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets",
  CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers",
  DET: "Detroit Pistons",
  IND: "Indiana Pacers",
  MIA: "Miami Heat",
  MIL: "Milwaukee Bucks",
  NYK: "New York Knicks",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  TOR: "Toronto Raptors",
  WAS: "Washington Wizards",
  DAL: "Dallas Mavericks",
  DEN: "Denver Nuggets",
  GSW: "Golden State Warriors",
  HOU: "Houston Rockets",
  LAC: "LA Clippers",
  LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies",
  MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans",
  OKC: "Oklahoma City Thunder",
  PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings",
  SAS: "San Antonio Spurs",
  UTA: "Utah Jazz",
};
export const IDS = {
  ATL: 1610612737,
  BOS: 1610612738,
  BKN: 1610612751,
  CHA: 1610612766,
  CHI: 1610612741,
  CLE: 1610612739,
  DET: 1610612765,
  IND: 1610612754,
  MIA: 1610612748,
  MIL: 1610612749,
  NYK: 1610612752,
  ORL: 1610612753,
  PHI: 1610612755,
  TOR: 1610612761,
  WAS: 1610612764,
  DAL: 1610612742,
  DEN: 1610612743,
  GSW: 1610612744,
  HOU: 1610612745,
  LAC: 1610612746,
  LAL: 1610612747,
  MEM: 1610612763,
  MIN: 1610612750,
  NOP: 1610612740,
  OKC: 1610612760,
  PHX: 1610612756,
  POR: 1610612757,
  SAC: 1610612758,
  SAS: 1610612759,
  UTA: 1610612762,
};
export function easternDay(ms = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
}
export function canPick(game, now = Date.now()) {
  return game.status === "scheduled" && game.tipoff > now;
}
export function standings(users, games, picks) {
  const finals = games.filter((g) => g.status === "final");
  return users
    .map((u) => {
      let correct = 0,
        missed = 0;
      for (const g of finals) {
        const p = picks.find((p) => p.user_id === u.id && p.game_id === g.id);
        if (!p) missed++;
        else if (p.team === g.winner) correct++;
      }
      return {
        ...u,
        correct,
        missed,
        total: finals.length,
        accuracy: finals.length ? correct / finals.length : null,
      };
    })
    .sort((a, b) => b.correct - a.correct || a.id - b.id);
}
export function validPrediction(category, value) {
  if (AWARDS.includes(category))
    return typeof value === "string" && value.length <= 100;
  if (category === "east" || category === "west") {
    const teams = category === "east" ? EAST : WEST;
    return (
      Array.isArray(value) &&
      value.length === 10 &&
      value.every((v) => v === "" || teams.includes(v)) &&
      new Set(value.filter(Boolean)).size === value.filter(Boolean).length
    );
  }
  if (category === "east_champ") return value === "" || EAST.includes(value);
  if (category === "west_champ") return value === "" || WEST.includes(value);
  if (category === "champ") return value === "" || TEAMS.includes(value);
  return false;
}
