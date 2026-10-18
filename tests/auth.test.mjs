import test from 'node:test';
import assert from 'node:assert/strict';
import { basicAuthorization } from '../src/auth.ts';

test('encodes HTTP Basic credentials using UTF-8', () => {
  assert.equal(basicAuthorization('https://code.example.com', {username:'user',password:'pāss'}),
    `Basic ${Buffer.from('user:pāss', 'utf8').toString('base64')}`);
});

test('omits proxy authentication when not configured', () => {
  assert.equal(basicAuthorization('http://127.0.0.1:4545'), undefined);
  assert.equal(basicAuthorization('http://127.0.0.1:4545', {username:'',password:''}), undefined);
});

test('never sends proxy credentials over HTTP or with an incomplete login', () => {
  assert.throws(() => basicAuthorization('http://127.0.0.1:4545', {username:'user',password:'pass'}), /HTTPS/);
  assert.throws(() => basicAuthorization('https://code.example.com', {username:'user',password:''}), /both/);
  assert.throws(() => basicAuthorization('https://code.example.com', {username:'user:name',password:'pass'}), /colon/);
});
