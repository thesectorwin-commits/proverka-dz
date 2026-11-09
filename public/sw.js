// Service worker сервиса проверки домашки.
//
// Намеренно НЕ кэшируем /api/** — ни в коем случае нельзя отдать
// устаревший или чужой результат проверки. Кэшируется только статика
// (JS/CSS/шрифты/иконки), чтобы приложение открывалось быстрее и
// не падало в белый экран при кратковременной потере сети.

// v2: старые кэши (в них могли оказаться закэшированные ответы-ошибки) удаляются при активации.
const CACHE_NAME = 'proverka-domashki-v2';
const APP_SHELL = ['/', '/manifest.json'];

// Если сервер молчит дольше этого времени, страницу показываем из кэша (а запрос к сети продолжается и обновит кэш).
// Без этого на нестабильной мобильной сети приложение долго висит на белом экране.
const NAVIGATION_TIMEOUT_MS = 4000;

// Кэшируем только успешные ответы: иначе 404/502 попадал в кэш и потом показывался вместо страницы.
function remember(request, response) {
  if (!response || !response.ok) return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {}) // офлайн-первую загрузку не блокируем, если что-то не закэшировалось
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // никогда не кэшируем API
  if (event.request.method !== 'GET') return;

  const request = event.request;

  // Файлы приложения с хэшем в имени неизменяемы: сначала кэш (мгновенно и без сети), иначе сеть.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            remember(request, response);
            return response;
          })
      )
    );
    return;
  }

  // Страницы: сеть в приоритете, но при молчании сервера дольше NAVIGATION_TIMEOUT_MS отдаём сохранённую копию.
  if (request.mode === 'navigate') {
    event.respondWith(
      new Promise((resolve) => {
        let settled = false;
        const done = (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        };
        const timer = setTimeout(() => {
          caches.match(request).then((cached) => {
            if (cached) done(cached);
          });
        }, NAVIGATION_TIMEOUT_MS);

        fetch(request)
          .then((response) => {
            remember(request, response);
            done(response);
          })
          .catch(() => caches.match(request).then((cached) => done(cached || Response.error())));
      })
    );
    return;
  }

  // Остальное (иконки, манифест и т.п.): сеть, при ошибке сети кэш.
  event.respondWith(
    fetch(request)
      .then((response) => {
        remember(request, response);
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});

// --- Push-уведомления ---

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Проверка домашки', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  const targetPath = new URL(targetUrl, self.location.origin).pathname;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      // Совпадение по pathname (без query) — окно с дашбордом на любой
      // вкладке считается подходящим, дальше просто переводим его на
      // точный targetUrl (с ?tab=/&checkId=), чтобы не плодить вкладки.
      const existing = clientsArr.find((c) => new URL(c.url).pathname === targetPath);
      if (existing) {
        if ('navigate' in existing) existing.navigate(targetUrl).catch(() => {});
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
