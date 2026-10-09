const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/3d.css': ['3d.css', 'text/css; charset=utf-8'],
  '/renderer3d.js': ['renderer3d.js', 'text/javascript; charset=utf-8'],
  '/vehicle.js': ['vehicle.js', 'text/javascript; charset=utf-8'],
  '/game.js': ['game.js', 'text/javascript; charset=utf-8'],
  '/timing.js': ['timing.js', 'text/javascript; charset=utf-8'],
  '/leaderboard.js': ['leaderboard.js', 'text/javascript; charset=utf-8'],
  '/i18n.js': ['i18n.js', 'text/javascript; charset=utf-8'],
  '/campus.js': ['campus.js', 'text/javascript; charset=utf-8'],
  '/sale.js': ['sale.js', 'text/javascript; charset=utf-8'],
  '/tilt.js': ['tilt.js', 'text/javascript; charset=utf-8'],
  '/sauna.js': ['sauna.js', 'text/javascript; charset=utf-8'],
  '/assets/lpr-logo.jpg': ['assets/lpr-logo.jpg', 'image/jpeg'],
  ...Object.fromEntries(['hk-sininen','megaforce','karjala','fazer-sininen','remix','lihapiirakka','snellman-nakki']
    .map(id=>[`/assets/${id}.jpg`,[`assets/${id}.jpg`,'image/jpeg']]))
};

const port = Number(process.env.PORT) || 8000;
http.createServer((request, response) => {
  const item = files[new URL(request.url, 'http://localhost').pathname];
  if (!item) { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': item[1] });
  fs.createReadStream(path.join(__dirname, item[0])).pipe(response);
}).listen(port, '0.0.0.0', () => {
  console.log(`LPR Lap Challenge: http://localhost:${port}`);
});
