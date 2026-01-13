const CACHE_NAME = 'water-tracker-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/client.js',
  '/icon.png',
  '/favicon/favicon.ico',
  '/favicon/favicon-96x96.png',
  '/favicon/favicon.svg',
  '/favicon/apple-touch-icon.png',
  '/favicon/site.webmanifest'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isStaticAsset = 
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.json') || // Manifest
    url.pathname.endsWith('.webmanifest');

  // Network-First Strategy for Static Assets
  if (isStaticAsset && url.protocol.startsWith('http')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(event.request);
        })
    );
  }
});

self.addEventListener('push', function (event) {
  const data = event.data.json();

  const options = {
    body: data.body,
    icon: '/icon.png',
    vibrate: [100, 50, 100],
    data: data.data,
    actions: data.actions,
    timestamp: Date.now(),
    requireInteraction: true,
    tag: 'water-reminder',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  console.log('Notification action:', event.action);

  // User clicked "I Drank It"
  if (event.action && event.action.startsWith('drink-')) {
    const amount = parseInt(event.action.split('-')[1], 10);
    console.log('Parsed amount:', amount);
    const { secret, userId } = event.notification.data;

    const promiseChain = fetch('/log-drink', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': secret,
      },
      body: JSON.stringify({
        userId: userId,
        amount: amount,
      }),
    });

    event.waitUntil(promiseChain);
  } else {
    event.waitUntil(self.clients.openWindow('/'));
  }
});
