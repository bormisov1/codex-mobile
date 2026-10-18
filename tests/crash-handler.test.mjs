import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

test('a fatal JavaScript error is saved before the share alert appears', () => {
  const calls = [];
  let handler;
  const global = { RN$handleException: () => false };
  const modules = {
    './src/diagnostics': {
      recordDiagnostic: (error, kind) => {
        calls.push(['record', kind, error.message]);
        return { name: 'Error', message: error.message };
      },
      formatDiagnostic: () => 'shareable stack',
    },
    'react-native': {
      Alert: { alert: (_title, _message, buttons) => { calls.push(['alert', Array.from(buttons, b => b.text)]); } },
      Share: { share: async () => {} },
    },
    'expo/AppEntry': {},
  };
  runInNewContext(source, { __DEV__: false, navigator: { product: 'ReactNative' }, global, require: name => modules[name] });
  handler = global.RN$handleException;
  assert.equal(handler(new Error('boom'), true), true);
  assert.deepEqual(calls, [
    ['record', 'fatal JavaScript error', 'boom'],
    ['alert', ['Copy details', 'Share details', 'Close']],
  ]);
  assert.equal(handler(new Error('again'), true), true);
  assert.equal(calls.length, 2);
});

test('a nonfatal exception retains the React Native handler', () => {
  const calls = [];
  const global = { RN$handleException: (...args) => { calls.push(args); return true; } };
  runInNewContext(source, {
    __DEV__: false,
    navigator: { product: 'ReactNative' },
    global,
    require: name => name === './src/diagnostics' ? {} : name === 'expo/AppEntry' ? {} : assert.fail(name),
  });
  assert.equal(global.RN$handleException('recoverable', false, true), true);
  assert.deepEqual(calls, [['recoverable', false, true]]);
});
