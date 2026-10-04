// Serves the TFT Web Lab page on http://localhost:8000 (started by start.bat).
// The page needs to come from localhost so the browser lets it use the USB port.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

http.createServer((req, res) => {
  const name = req.url.split('?')[0] === '/' ? 'index.html' : path.basename(req.url.split('?')[0]);
  fs.readFile(path.join(__dirname, name), (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(name)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`TFT Web Lab is running at http://localhost:${PORT}`);
  console.log('Keep this window open while you use the page. Close it to stop.');
});
