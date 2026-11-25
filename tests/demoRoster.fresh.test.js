import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
const load = async () => (await import(`../src/services/studentRosterService.js?v=${Math.random()}`)).studentRosterService;

test('fresh browser: all six demo candidates are added once; an admin removal sticks', async () => {
  let svc = await load();
  assert.deepEqual(svc.list().filter((s) => s.demo).map((s) => s.usn), ['CS001', 'CS002', 'CS003', 'CS004', 'CS005', 'CS006']);
  assert.equal(svc.isEligible('cs006'), true);
  assert.equal(svc.find('CS006').name, 'CS Demo 06');
  svc = await load();
  assert.equal(svc.list().filter((s) => s.usn === 'CS006').length, 1, 'no duplicates on reload');
  svc.remove('CS006');
  svc = await load();
  assert.equal(svc.find('CS006'), null, 'removed demo candidate is not re-added');
  assert.equal(svc.find('CS001').name, 'CS Demo 01');
});
