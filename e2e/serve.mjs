// Tiny static server for dist/ at /truss-spacer/cad/ (like GitHub Pages: Cache-Control max-age=600).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain', '.md': 'text/plain' };
export function serve(dist, port = 0) {
  return new Promise(resolve => {
    const srv = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://x');
      if (!url.pathname.startsWith('/truss-spacer/cad/')) { res.writeHead(404); return res.end('not found'); }
      let rel = normalize(url.pathname.slice('/truss-spacer/cad/'.length)).replace(/^(\.\.[/\\])+/, '');
      if (!rel || rel === '.' || rel.endsWith('/')) rel = (rel === '.' ? '' : rel) + 'index.html';
      try {
        const body = await readFile(join(dist, rel));
        res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600' }); res.end(body);
      } catch { res.writeHead(404); res.end('not found'); }
    });
    srv.listen(port, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}/truss-spacer/cad/` }));
  });
}
