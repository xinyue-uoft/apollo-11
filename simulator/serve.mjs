#!/usr/bin/env node
// Zero-dependency static file server for the AGC simulator.
//
// It serves the *repository root* (not just simulator/) so that the source
// panel can fetch the real Luminary099/ and Comanche055/ listings.
//
//   node simulator/serve.mjs            -> http://localhost:8011/simulator/
//   PORT=9000 node simulator/serve.mjs

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 8011;
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.agc': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path === '/') {
      res.writeHead(302, { Location: '/simulator/' });
      res.end();
      return;
    }
    const file = normalize(join(ROOT, path));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let target = file;
    let info = await stat(target).catch(() => null);
    if (info && info.isDirectory()) {
      if (!path.endsWith('/')) {
        res.writeHead(301, { Location: `${path}/` });
        res.end();
        return;
      }
      target = join(target, 'index.html');
      info = await stat(target).catch(() => null);
    }
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(target).pipe(res);
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AGC simulator: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/simulator/`);
});
