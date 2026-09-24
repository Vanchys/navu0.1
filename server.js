// Servidor estático mínimo para el dashboard (solo Node, sin dependencias).
// Escucha en todas las interfaces para poder abrirlo desde el celular en la misma red WiFi.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;

// Tipos de contenido que necesita el navegador (sobre todo .glb y módulos .js)
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Convierte la URL pedida en una ruta dentro de ROOT, bloqueando accesos fuera de la carpeta
function resolveSafePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const fullPath = path.normalize(path.join(ROOT, relative));
  return fullPath.startsWith(ROOT) ? fullPath : null;
}

// Evita servir archivos internos (scripts de exportación, el propio servidor)
function isPrivate(filePath) {
  const relative = path.relative(ROOT, filePath).split(path.sep);
  return relative[0] === 'tools' || relative[0] === 'server.js' || relative[0].startsWith('.');
}

function handleRequest(req, res) {
  const filePath = resolveSafePath(req.url);
  if (!filePath || isPrivate(filePath)) {
    res.writeHead(403).end('Prohibido');
    return;
  }
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404).end('No encontrado');
      return;
    }
    const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    // Sin caché: así al re-exportar un personaje se ve el cambio al recargar
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stats.size, 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
}

// Lista las IPs de la red local para mostrarlas al arrancar
function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net.address);
}

http.createServer(handleRequest).listen(PORT, '0.0.0.0', () => {
  console.log('\n  Dashboard de personajes listo\n');
  console.log(`  En esta PC:      http://localhost:${PORT}`);
  for (const ip of getLanAddresses()) {
    console.log(`  En tu celular:   http://${ip}:${PORT}   (misma red WiFi)`);
  }
  console.log('\n  Ctrl + C para detener.\n');
});
