import assert from 'node:assert/strict';
import test from 'node:test';
import { DateTime } from 'luxon';
import {
  assertApiSuccess,
  customerSyncPayload,
  updatedAfter,
} from './sync-customers.js';

test('uses a 30-minute UTC overlap window', () => {
  const now = DateTime.fromISO('2026-09-13T12:34:56Z', { setZone: true });
  assert.equal(updatedAfter(now), '2026-09-13 12:04:56');
});

test('encodes customers as the fixed API payload', () => {
  const customers = [{ id: 'customer-1', name: '測試' }];
  const payload = customerSyncPayload(customers, 'secret');
  assert.equal(payload.API金鑰, 'secret');
  assert.deepEqual(JSON.parse(payload.JSON), customers);
});

test('rejects API failures and accepts OK', () => {
  assert.equal(assertApiSuccess([{ Code: 'OK', CustomerCount: 2 }]).CustomerCount, 2);
  assert.throws(
    () => assertApiSuccess([{ Code: 'AUTH_FAILED' }]),
    /AUTH_FAILED/,
  );
});
