import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEvent, matchGame, runSync } from '../server/results.js';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/scoreboard.json', import.meta.url)));
function database(t) {
 const dir=mkdtempSync(join(tmpdir(),'nba-sync-')); t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const run=(sql,args=[],script=false)=> {
  const result=spawnSync('python3',['-c',`import sqlite3,json,sys
c=sqlite3.connect(sys.argv[1]); c.row_factory=sqlite3.Row
sql,args,script=json.loads(sys.stdin.read())
if script: c.executescript(sql); rows=[]; changes=0
else:
 cur=c.execute(sql,args); rows=[dict(r) for r in cur.fetchall()]; changes=max(cur.rowcount,0)
c.commit(); print(json.dumps({'results':rows,'meta':{'changes':changes}}))`,join(dir,'db.sqlite')],{input:JSON.stringify([sql,args,script]),encoding:'utf8'});
  if(result.status) throw Error(result.stderr); return JSON.parse(result.stdout);
 };
 run(readFileSync(new URL('../migrations/0001.sql',import.meta.url),'utf8'),[],true);
 run(readFileSync(new URL('../migrations/0004_result_sync.sql',import.meta.url),'utf8'),[],true);
 return { run, prepare(sql) { return { bind(...args) {return {run:async()=>run(sql,args),all:async()=>run(sql,args),first:async()=>run(sql,args).results[0]||null};}, first:async()=>run(sql).results[0]||null }; }, async batch(statements) {return Promise.all(statements.map(s=>s.run()));} };
}
test('strict final validation and unambiguous matching',()=>{
 const e=parseEvent(fixture.events[0]); assert.equal(e.winner,'DET');
 const live=structuredClone(fixture.events[0]); live.status.type.completed=false; assert.equal(parseEvent(live).final,false);
 const tie=structuredClone(fixture.events[0]); tie.competitions[0].competitors[1].score=tie.competitions[0].competitors[0].score; assert.throws(()=>parseEvent(tie));
 const playoff=structuredClone(fixture.events[0]); playoff.season.type=3; assert.equal(parseEvent(playoff),null);
 assert.equal(matchGame(e,[{...e,id:'a',provider_id:null},{...e,id:'b',provider_id:null}]),null);
 assert.equal(matchGame(e,[{...e,id:'a',home:'BOS'}]),null);
});
test('dry run, protected games, idempotency, corrections, failures and lock',async t=>{
 const DB=database(t); const now=Date.now();
 const day= new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now-86400000);
 const data=structuredClone(fixture); data.events.forEach(e=>e.date=day+'T19:00:00Z');
 data.events.forEach(e=>{const p=parseEvent(e);DB.run('INSERT INTO games(id,home,away,tipoff,day) VALUES(?,?,?,?,?)',[e.id,p.home,p.away,now-86400000,day]);});
 DB.run("UPDATE games SET manual_result=1,result_source='manual' WHERE id=?",[data.events[0].id]);
 const fetcher=async url=>new Response(JSON.stringify(url.includes(day.replaceAll('-',''))?data:{events:[]}));
 let r=await runSync({DB},{dryRun:true,fetcher,now}); assert.equal(r.errors.length,0);assert.equal(r.proposed.length,2); assert.equal(DB.run("SELECT * FROM games WHERE status='final'").results.length,0);
 r=await runSync({DB},{fetcher,now});assert.equal(r.added,2);assert.equal(r.protected,1);
 r=await runSync({DB},{fetcher,now});assert.equal(r.added+r.corrected,0);
 data.events[1].competitions[0].competitors.find(c=>c.winner).score=String(Number(data.events[1].competitions[0].competitors.find(c=>c.winner).score)+1);
 r=await runSync({DB},{fetcher,now}); assert.equal(r.corrected,1);
 assert.equal(DB.run('SELECT * FROM result_history').results.length,3);
 r=await runSync({DB},{fetcher:async()=>{throw Error('offline')},now});assert.ok(r.errors.length);assert.equal(DB.run("SELECT * FROM games WHERE status='final'").results.length,2);
 DB.run('UPDATE sync_lock SET expires=? WHERE id=1',[now+600000]); assert.equal((await runSync({DB},{fetcher,now})).busy,true);
});
