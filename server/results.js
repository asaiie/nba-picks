import { TEAMS, easternDay } from '../shared.js';
const DAY = 86400000;
const alias = { NY: 'NYK', GS: 'GSW', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX' };
export function parseEvent(e) {
  if (e.season?.type !== 2 || e.season?.year !== 2027) return null;
  const c = e.competitions?.[0];
  if (!c || c.competitors?.length !== 2) throw Error('Invalid competitors');
  const home = c.competitors.find(t => t.homeAway === 'home');
  const away = c.competitors.find(t => t.homeAway === 'away');
  const code = t => alias[t?.team?.abbreviation] || t?.team?.abbreviation;
  const h = code(home), a = code(away);
  if (!TEAMS.includes(h) || !TEAMS.includes(a) || h === a || !e.id || !Number.isFinite(Date.parse(e.date))) throw Error('Invalid matchup');
  const status = c.status?.type || e.status?.type;
  const result = { provider_id: String(e.id), home: h, away: a, day: easternDay(Date.parse(e.date)), final: status?.completed === true && status?.name === 'STATUS_FINAL', status: status?.name };
  if (!result.final) return result;
  const score = v => /^\d+$/.test(String(v)) ? Number(v) : NaN;
  result.home_score = score(home.score); result.away_score = score(away.score);
  if (![result.home_score,result.away_score].every(v => Number.isInteger(v) && v > 0 && v < 300) || result.home_score === result.away_score) throw Error('Invalid final scores');
  result.winner = result.home_score > result.away_score ? h : a;
  if ((home.winner !== undefined && home.winner !== (result.winner === h)) || (away.winner !== undefined && away.winner !== (result.winner === a))) throw Error('Inconsistent winner');
  return result;
}
export function matchGame(event, games) {
  const mapped = games.filter(g => g.provider_id === event.provider_id);
  const candidates = mapped.length ? mapped : games.filter(g => g.day === event.day && g.home === event.home && g.away === event.away && !g.provider_id);
  if (candidates.length !== 1 || candidates[0].home !== event.home || candidates[0].away !== event.away || candidates[0].day !== event.day) return null;
  return candidates[0];
}
export async function runSync(env, { dryRun = false, fetcher = fetch, now = Date.now() } = {}) {
  const db = env.DB, token = crypto.randomUUID();
  const q = (sql,...args) => db.prepare(sql).bind(...args);
  const lock = await q('UPDATE sync_lock SET token=?,expires=? WHERE id=1 AND expires<?',token,now+10*60000,now).run();
  if (!lock.meta.changes) return { busy: true };
  const report = { dryRun, added: 0, corrected: 0, protected: 0, proposed: [], issues: [], errors: [] };
  try {
    await q('INSERT INTO sync_runs(id,started) VALUES(?,?)',token,now).run();
    const today = easternDay(now), cutoff = easternDay(now-7*DAY);
    const old = await q("SELECT g.day FROM games g LEFT JOIN sync_days s ON s.day=g.day WHERE g.day<? AND g.status IN ('scheduled','postponed') AND g.manual_result=0 AND COALESCE(s.checked,0)<? GROUP BY g.day ORDER BY COALESCE(s.checked,0),g.day LIMIT 1",cutoff,now-DAY).first();
    // Always check today/yesterday; rotate correction dates to keep each run small.
    const recent = await q('SELECT g.day FROM games g LEFT JOIN sync_days s ON s.day=g.day WHERE g.day>=? AND g.day<? GROUP BY g.day ORDER BY COALESCE(s.checked,0),g.day LIMIT 1',cutoff,easternDay(now-DAY)).first();
    const days = [...new Set([today,easternDay(now-DAY),...(recent ? [recent.day] : []),...(old ? [old.day] : [])])].filter(d=>d>='2026-10-20');
    const { results: games } = await q('SELECT * FROM games WHERE day IN ('+days.map(()=>'?').join(',')+')',...days).all();
    const changes = [], seen = new Set();
    for (const day of days) {
      try {
        const response = await fetcher('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates='+day.replaceAll('-','')+'&limit=100',{signal:AbortSignal.timeout(12000)});
        if (!response.ok) throw Error('Scoreboard returned HTTP '+response.status);
        const body = await response.json();
        if (!Array.isArray(body.events)) throw Error('Invalid scoreboard response');
        for (const raw of body.events) {
          try {
            const event = parseEvent(raw);
            if (!event || event.day > today) continue;
            const game = matchGame(event,games);
            if (!game) { report.issues.push(`${event.day}: ${event.away} at ${event.home} — unmatched game; review schedule`); continue; }
            seen.add(game.id);
            if (game.manual_result) { report.protected++; continue; }
            if (!event.final) {
              if (/POSTPONED|CANCELED/.test(event.status || '')) report.issues.push(`${game.day}: ${game.away} at ${game.home} — ${event.status}`);
              continue;
            }
            if (!['scheduled','final'].includes(game.status)) { report.issues.push(`${game.id}: ${game.status}; review before finalizing`); continue; }
            if (game.tipoff > now) { report.issues.push(`${game.id}: final result conflicts with future tip-off`); continue; }
            if (game.status === 'final' && game.winner === event.winner && game.home_score === event.home_score && game.away_score === event.away_score) continue;
            if (changes.length >= 20) { report.issues.push('Additional results deferred to the next run'); continue; }
            report.proposed.push({game:game.id,day:game.day,away:game.away,home:game.home,winner:event.winner,away_score:event.away_score,home_score:event.home_score});
            changes.push({game,event});
          } catch (e) { report.issues.push(`${day}: event ${raw.id || 'unknown'} — ${e.message}`); }
        }
        if (!dryRun) await q('INSERT INTO sync_days VALUES(?,?) ON CONFLICT(day) DO UPDATE SET checked=excluded.checked',day,now).run();
      } catch (e) { report.errors.push(`${day}: ${e.message}`); }
    }
    for (const g of games) if (g.tipoff < now-8*3600000 && ['scheduled','postponed'].includes(g.status) && !g.manual_result && !seen.has(g.id)) report.issues.push(`${g.day}: ${g.away} at ${g.home} — no matching result found`);
    if (!dryRun && changes.length) {
      const updates = await db.batch(changes.map(({game:g,event:e}) => q("UPDATE games SET status='final',winner=?,home_score=?,away_score=?,result_source='espn',result_updated=?,provider_id=? WHERE id=? AND manual_result=0 AND status IN ('scheduled','final') AND tipoff=? AND home=? AND away=? AND EXISTS(SELECT 1 FROM sync_lock WHERE id=1 AND token=? AND expires>?)",e.winner,e.home_score,e.away_score,now,e.provider_id,g.id,g.tipoff,g.home,g.away,token,Date.now())));
      updates.forEach((u,i) => { if(u.meta.changes) report[changes[i].game.status === 'final' ? 'corrected' : 'added']++; });
    }
    report.issues = [...new Set(report.issues)].slice(0,100);
    await q('UPDATE sync_runs SET finished=?,success=?,report=? WHERE id=?',Date.now(),report.errors.length ? 0 : 1,JSON.stringify(report),token).run();
    await db.batch([q('DELETE FROM sync_runs WHERE started<?',now-30*DAY),q('DELETE FROM result_history WHERE changed<?',now-90*DAY)]);
    return report;
  } catch(e) {
    report.errors.push(e.message);
    await q('UPDATE sync_runs SET finished=?,success=0,report=? WHERE id=?',Date.now(),JSON.stringify(report),token).run();
    return report;
  } finally { await q('UPDATE sync_lock SET token=NULL,expires=0 WHERE id=1 AND token=?',token).run(); }
}
export async function syncStatus(db) {
  const latest = await db.prepare('SELECT * FROM sync_runs ORDER BY started DESC LIMIT 1').first();
  const success = await db.prepare("SELECT finished FROM sync_runs WHERE success=1 AND json_extract(report,'$.dryRun')=0 ORDER BY started DESC LIMIT 1").first();
  return { latest: latest ? {...latest,report:latest.report ? JSON.parse(latest.report) : null} : null, lastSuccess:success?.finished || null };
}
