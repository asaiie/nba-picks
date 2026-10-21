import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../server/api.js';
test('guests can read public league data without private account fields', async () => {
  const env = { DB: { prepare(sql) {
    assert.ok(!/password|sessions|attempts/.test(sql));
    return { bind() { return { all: async () => ({ results: sql.startsWith('SELECT id,name FROM users') ? [{ id: 1, name: 'Amit' }] : [] }) }; } };
  } } };
  const response = await onRequest({ env, request: new Request('https://nba.amitsai.com/api/state') });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.user, null);
  assert.deepEqual(data.users, [{ id: 1, name: 'Amit' }]);
});
test('guests cannot write picks, predictions, results or reset accounts', async () => {
  const env = { DB: { prepare() { throw Error('Guest must not reach database writes'); } } };
  for (const path of ['pick', 'prediction', 'admin/game', 'admin/outcome', 'admin/reset', 'logout']) {
    const response = await onRequest({ env, request: new Request('https://nba.amitsai.com/api/' + path, {
      method: 'POST', headers: { Origin: 'https://nba.amitsai.com', 'Content-Type': 'application/json' }, body: '{}'
    }) });
    assert.equal(response.status, 401);
  }
});
