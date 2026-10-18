import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('the Markdown parser can construct its linkifier and render a message', () => {
  const markdownRequire = createRequire(require.resolve('react-native-markdown-display'));
  const MarkdownIt = markdownRequire('markdown-it');
  const html = MarkdownIt({ typographer: true }).render('Hello [Modex](https://example.com)');
  assert.match(html, /<a href="https:\/\/example\.com">Modex<\/a>/);
});
