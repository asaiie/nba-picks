import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import {readFileSync} from 'node:fs';
test('HTTP page and API requests redirect before assets or database access',async()=>{
 for (const [path,method] of [['/','GET'],['/app.js','GET'],['/api/login','POST'],['/api/accounts?test=1','GET']]) {
  const response=await worker.fetch(new Request('http://nba.amitsai.com'+path,{method}),{});
  assert.equal(response.status,308);
  assert.equal(response.headers.get('Location'),'https://nba.amitsai.com'+path);
 }
});
test('HTTPS assets include HSTS and retain their existing headers',async()=>{
 const response=await worker.fetch(new Request('https://nba.amitsai.com/'),{ASSETS:{fetch:async()=>new Response('page',{headers:{'Content-Type':'text/html'}})}});
 assert.equal(await response.text(),'page');assert.equal(response.headers.get('Content-Type'),'text/html');assert.equal(response.headers.get('Strict-Transport-Security'),'max-age=31536000');
});
test('local HTTP preview stays usable',async()=>{
 const response=await worker.fetch(new Request('http://localhost:8788/'),{ASSETS:{fetch:async()=>new Response('local')}});
 assert.equal(response.status,200);assert.equal(await response.text(),'local');
});
test('production assets cannot bypass HTTPS enforcement',()=>{
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(config.assets.run_worker_first,true);
});
