import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

test('native fatal listener saves the JavaScript stack and offers sharing before preventing the abort', () => {
  const calls = [];
  const global = { RN$registerExceptionListener: fn => { global.listener = fn; } };
  Object.defineProperty(global, 'RN$handleException', { value: () => true, writable: false });
  const modules = {
    './src/diagnostics': {
      recordDiagnostic: (error, kind) => {
        calls.push(['record', kind, error.message, error.stack]);
        return { name: error.name, message: error.message };
      },
      formatDiagnostic: () => 'shareable stack',
    },
    'react-native': {
      Alert: { alert: (_title, _message, buttons) => { calls.push(['alert', Array.from(buttons, b => b.text)]); } },
      Share: { share: async () => {} },
    },
    'expo/AppEntry': {},
  };
  runInNewContext(source, { __DEV__: false, global, require: name => modules[name] });
  global.listener({
    name: 'TypeError', message: 'TypeError: boom', isFatal: true,
    extraData: { rawStack: 'raw JS stack' },
    preventDefault: () => calls.push(['preventDefault']),
  });
  assert.deepEqual(calls, [
    ['record', 'fatal JavaScript error', 'boom', 'raw JS stack'],
    ['alert', ['Copy details', 'Share details', 'Close']],
    ['preventDefault'],
  ]);
});

test('nonfatal native reports remain with React Native', () => {
  const calls = [];
  const global = { RN$registerExceptionListener: fn => { global.listener = fn; } };
  runInNewContext(source, {
    __DEV__: false, global,
    require: name => name === './src/diagnostics' ? { recordDiagnostic: () => calls.push('record') } : name === 'expo/AppEntry' ? {} : assert.fail(name),
  });
  global.listener({ isFatal: false, preventDefault: () => calls.push('preventDefault') });
  assert.deepEqual(calls, []);
});
