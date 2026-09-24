// Service worker de la PWA: guarda la app en el celular para que abra rápido y funcione sin conexión.
// Al cambiar archivos de la app, sube CACHE_VERSION para que los celulares descarguen la versión nueva.
const CACHE_VERSION = 'navu-v1';

// Archivos que se guardan desde la instalación (rutas relativas: funcionan en cualquier subcarpeta, ej. GitHub Pages)
const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/main.js',
  './js/catalog.js',
  './js/character-info.js',
  './js/character-player.js',
  './js/confetti.js',
  './js/feeding-tray.js',
  './js/golden-ticket.js',
  './js/inventory.js',
  './js/score-bar.js',
  './js/sounds.js',
  './js/stage.js',
  './js/trip-map.js',
  './js/trip-request.js',
  './js/ui.js',
  './vendor/three/three.module.js',
  './vendor/three/three.core.js',
  './vendor/three/addons/controls/OrbitControls.js',
  './vendor/three/addons/loaders/GLTFLoader.js',
  './vendor/three/addons/utils/BufferGeometryUtils.js',
  './vendor/three/addons/utils/SkeletonUtils.js',
  './characters/index.json',
  './characters/robot-mascota/character.json',
  './characters/robot-mascota/model.glb',
];

// Instalación: descarga y guarda todos los archivos de la app
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

// Activación: borra versiones viejas de la app
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// Peticiones: responde con lo guardado al instante y actualiza en segundo plano si hay internet
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreSearch: true });
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
