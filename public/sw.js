self.addEventListener('push', function (event) {
  const data = event.data.json();

  const options = {
    body: data.body,
    icon: '/icon.png',
    vibrate: [100, 50, 100],
    data: data.data,
    actions: data.actions,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  // User clicked "I Drank It"
  if (event.action === 'drink') {
    const secret = event.notification.data.secret;

    const promiseChain = fetch('/log-drink', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': secret,
      },
    });

    event.waitUntil(promiseChain);
  } else {
    event.waitUntil(self.clients.openWindow('/'));
  }
});
