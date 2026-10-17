import http from 'node:http';
import https from 'node:https';
import { createReadStream, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

const port = Number(process.env.PREVIEW_PORT || 8085);
const bind = '127.0.0.1';
const backend = new URL(process.env.CODEX_BACKEND_ORIGIN || 'http://127.0.0.1:4545');
if (!['http:', 'https:'].includes(backend.protocol) || backend.pathname !== '/' || backend.search || backend.hash) {
  throw new Error('CODEX_BACKEND_ORIGIN must be an HTTP(S) origin without a path');
}
const root = resolve('dist');
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${bind}:${port}`);
  const previewOrigin = `http://${bind}:${port}`;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    const suppliedOrigin = request.headers.origin;
    if (suppliedOrigin && suppliedOrigin !== previewOrigin) {
      response.writeHead(403).end('Invalid origin');
      return;
    }
    const headers = { ...request.headers, host: backend.host };
    if (request.method !== 'GET' && request.method !== 'HEAD') headers.origin = backend.origin;
    const upstream = (backend.protocol === 'https:' ? https : http).request(backend, {
      protocol: backend.protocol, hostname: backend.hostname, port: backend.port,
      path: url.pathname + url.search, method: request.method, headers,
    }, upstreamResponse => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.on('error', error => {
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain' });
      response.end(`Codex backend unavailable: ${error.message}`);
    });
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
    return;
  }
  let path = resolve(root, '.' + decodeURIComponent(url.pathname));
  if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    if (statSync(path).isDirectory()) path = resolve(path, 'index.html');
    if (!statSync(path).isFile()) throw new Error('Not a file');
  } catch {
    path = resolve(root, 'index.html');
    try { statSync(path); } catch { response.writeHead(404).end('Build the web app first'); return; }
  }
  response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream',
    'Cache-Control': path.endsWith('index.html') ? 'no-store' : 'public, max-age=3600' });
  createReadStream(path).pipe(response);
}).listen(port, bind, () => {
  console.log(`Codex Mobile browser preview: http://${bind}:${port}`);
  console.log(`Codex WebUI backend: ${backend.origin}`);
});
