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

// A browser that ran the earlier build: CS001–CS005 already added (v1 flag), one edited by an admin.
const existing = ['CS001', 'CS002', 'CS003', 'CS004', 'CS005'].map((usn, i) => ({
  usn, name: `CS Demo 0${i + 1}`, email: `${usn.toLowerCase()}@drait.edu.in`, department: 'Computer Science & Engineering',
  semester: 6, section: 'D', status: usn === 'CS004' ? 'Withheld' : 'Eligible', remarks: usn === 'CS004' ? 'edited by admin' : '', demo: true,
}));
globalThis.localStorage.setItem('examsphere_candidate_roster_v1', JSON.stringify(existing));
globalThis.localStorage.setItem('examsphere_demo_candidates_added_v1', 'true');

test('existing CS001–CS005 roster gains CS006 without any change to CS001–CS005', async () => {
  const { studentRosterService: svc } = await import('../src/services/studentRosterService.js');
  const list = svc.list();
  assert.deepEqual(list.map((s) => s.usn), ['CS001', 'CS002', 'CS003', 'CS004', 'CS005', 'CS006']);
  assert.deepEqual(list.slice(0, 5), existing, 'CS001–CS005 entries untouched (admin edits kept)');
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('examsphere_demo_candidates_added_v2')).sort(), ['CS001', 'CS002', 'CS003', 'CS004', 'CS005', 'CS006']);
});
