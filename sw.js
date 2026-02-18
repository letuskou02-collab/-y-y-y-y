const CACHE_NAME = 'kokudo-sticker-v1';
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json'
];

// インストール処理
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(URLS_TO_CACHE);
            })
            .catch((error) => {
                console.log('Cache addAll error:', error);
            })
    );
    self.skipWaiting();
});

// アクティベート処理
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// フェッチイベント処理
self.addEventListener('fetch', (event) => {
    // GETリクエストのみ処理
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // キャッシュに存在する場合はそれを返す
                if (response) {
                    return response;
                }

                // キャッシュにない場合はネットワークからリソースを取得
                return fetch(event.request)
                    .then((response) => {
                        // ネットワークエラーの場合は処理しない
                        if (!response || response.status !== 200 || response.type === 'error') {
                            return response;
                        }

                        // レスポンスをクローンしてキャッシュに保存
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch(() => {
                        // ネットワークエラー時はキャッシュから返す、なければ404を返す
                        return caches.match(event.request);
                    });
            })
    );
});
