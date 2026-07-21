/* global self, URL */

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const target = new URL(targetUrl, self.location.origin);
      const existingClient = clients.find((client) => {
        const clientUrl = new URL(client.url);
        return clientUrl.origin === target.origin && clientUrl.pathname === target.pathname;
      });

      if (existingClient) {
        return existingClient.focus();
      }

      return self.clients.openWindow(target.href);
    }),
  );
});
