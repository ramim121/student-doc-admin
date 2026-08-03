import assert from 'node:assert/strict';
import test from 'node:test';
import { getSafeRedirectPath } from '../lib/safe-redirect';

test('keeps valid same-origin admin paths', () => {
  assert.equal(getSafeRedirectPath('/resources?status=pending'), '/resources?status=pending');
});

test('rejects external and protocol-relative redirects', () => {
  assert.equal(getSafeRedirectPath('https://evil.example'), '/');
  assert.equal(getSafeRedirectPath('//evil.example/path'), '/');
});

test('rejects backslash redirect tricks and empty values', () => {
  assert.equal(getSafeRedirectPath('/\\evil.example'), '/');
  assert.equal(getSafeRedirectPath(undefined), '/');
});
