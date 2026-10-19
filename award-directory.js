import { PLAYERS, COACHES } from "./data/award-candidates.js";
export function normalizeName(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export function awardCandidates(category) {
  return category === "COTY" ? COACHES : category === "EOTY" ? [] : PLAYERS;
}
export function canonicalAwardName(category, value) {
  if (value === "") return "";
  const name = normalizeName(value);
  return (
    awardCandidates(category).find((p) => normalizeName(p.name) === name)
      ?.name ?? null
  );
}
export function searchAwardCandidates(category, query) {
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return awardCandidates(category)
    .filter((p) => tokens.every((t) => normalizeName(p.name).includes(t)))
    .slice(0, 25);
}
