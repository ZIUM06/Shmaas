const CACHE_NAME = "shmaas-shell-v12";
const APP_SHELL = [
    "login.html",
    "index.html",
    "download.html",
    "offline.html",
    "student.html",
    "marketplace.html",
    "manifest.webmanifest",
    "auth.js",
    "pwa.js",
    "style.css",
    "script.js",
    "app-settings.js",
    "chatbot.css",
    "chatbot.html",
    "chatbot.js",
    "logo.png",
    "assets/tvet-mara-besut-logo.png",
    "assets/tvet-mara-logo-transparent.png",
    "assets/shmia-chatbot.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => Promise.allSettled(APP_SHELL.map((entry) => cache.add(entry))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok && response.type === "basic" && !response.redirected) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(async () => {
                    const cachedPage = await caches.match(request);
                    return cachedPage || caches.match("login.html") || caches.match("index.html") || caches.match("offline.html");
                })
        );
        return;
    }

    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request))
    );
});
