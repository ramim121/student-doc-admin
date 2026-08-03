import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { isTrustedAdminMutationOrigin } from '../lib/request-security';

test('admin mutation origin must match the admin request host', () => {
  const trusted = new NextRequest('https://admin.example/api/resources/id/delete', {
    method: 'POST', headers: { origin: 'https://admin.example', host: 'admin.example' },
  });
  const crossSite = new NextRequest('https://admin.example/api/resources/id/delete', {
    method: 'POST', headers: { origin: 'https://attacker.example', host: 'admin.example' },
  });
  const missing = new NextRequest('https://admin.example/api/resources/id/delete', { method: 'POST' });
  assert.equal(isTrustedAdminMutationOrigin(trusted), true);
  assert.equal(isTrustedAdminMutationOrigin(crossSite), false);
  assert.equal(isTrustedAdminMutationOrigin(missing), false);
});
