self.addEventListener('push', function (event) {
  const data = event.data.json();

  const options = {
    body: data.body,
    icon: 'https://cdn-icons-png.flaticon.com/512/3105/3105807.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '2',
    },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});
