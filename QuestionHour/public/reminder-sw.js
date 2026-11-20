self.addEventListener('push', event => {
  let body = 'Would you like your daily dose now?';
  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload.body) body = payload.body;
    } catch (error) {
      console.error('Invalid reminder payload:', error);
    }
  }
  event.waitUntil(self.registration.showNotification('Your Daily Dose', {
    body,
    icon: '/logo192.png',
    tag: 'daily-dose-reminder'
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const client = clients.find(entry => new URL(entry.url).origin === self.location.origin);
    return client ? client.focus() : self.clients.openWindow('/');
  }));
});
