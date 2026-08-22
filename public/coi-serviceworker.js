/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
/*
 * Cross-Origin Isolation Service Worker
 * 
 * WHY THIS FILE EXISTS:
 * ffmpeg.wasm requires SharedArrayBuffer for multi-threaded WebAssembly execution.
 * SharedArrayBuffer is only available in "cross-origin isolated" contexts, which require
 * two HTTP headers:
 *   - Cross-Origin-Opener-Policy: same-origin
 *   - Cross-Origin-Embedder-Policy: require-corp
 *
 * GitHub Pages (and many static hosts) don't allow setting custom HTTP headers.
 * This service worker intercepts all fetch requests and injects these headers
 * into the responses, achieving cross-origin isolation client-side.
 *
 * HOW IT WORKS:
 * 1. On first page load, this script registers itself as a service worker and reloads
 * 2. Once the SW is active, it intercepts every fetch request
 * 3. It clones each response and adds the required COOP/COEP headers
 * 4. The browser then considers the page "cross-origin isolated"
 * 5. SharedArrayBuffer becomes available, and ffmpeg.wasm can load
 *
 * IMPORTANT: This file must be served from the same origin as your page.
 * It CANNOT be loaded from a CDN or bundled into your app JS.
 * Place it in /public/ so Vite copies it to the build root without processing.
 */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("message", (ev) => {
        if (!ev.data) {
            return;
        } else if (ev.data.type === "deregister") {
            self.registration
                .unregister()
                .then(() => {
                    return self.clients.matchAll();
                })
                .then(clients => {
                    clients.forEach((client) => client.navigate(client.url));
                });
        } else if (ev.data.type === "coepCredentialless") {
            coepCredentialless = ev.data.value;
        }
    });

    self.addEventListener("fetch", function (event) {
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
            return;
        }

        const request = (coepCredentialless && r.mode === "no-cors")
            ? new Request(r, {
                credentials: "omit",
            })
            : r;
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy",
                        coepCredentialless ? "credentialless" : "require-corp"
                    );
                    if (!coepCredentialless) {
                        newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
                    }
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => console.error(e))
        );
    });

} else {
    (() => {
        const reloadedByCOI = window.sessionStorage.getItem("coiReloadedByCOI");
        window.sessionStorage.removeItem("coiReloadedByCOI");

        const coepDegrading = (reloadedByCOI === "coepdegrade");

        // You can customize the behavior of this script through a global `coi` variable.
        const coi = {
            shouldRegister: () => !reloadedByCOI,
            shouldDeregister: () => false,
            coepCredentialless: () => true,
            coepDegrade: () => true,
            doReload: () => window.location.reload(),
            quiet: false,
            ...(window.coi || {})
        };

        if (coi.shouldDeregister()) {
            navigator.serviceWorker.controller &&
            navigator.serviceWorker.controller.postMessage({ type: "deregister" });
            return;
        }

        // If we're already cross-origin isolated, no need for the service worker
        if (window.crossOriginIsolated) {
            if (!coi.quiet) console.log("[coi] Page is already cross-origin isolated.");
            return;
        }

        if (!coi.shouldRegister()) {
            if (!coi.quiet) console.log("[coi] Will not register service worker.");
            return;
        }

        // In some environments, coe policy errors cannot be fixed with require-corp.
        // Use credentialless mode as a fallback.
        if (!window.isSecureContext) {
            if (!coi.quiet) console.log("[coi] This page is not served in a secure context, cannot register service worker.");
            return;
        }

        if (navigator.serviceWorker) {
            navigator.serviceWorker.register(window.document.currentScript.src).then(
                (registration) => {
                    if (!coi.quiet) console.log("[coi] Service worker registered.", registration.scope);

                    registration.addEventListener("updatefound", () => {
                        if (!coi.quiet) console.log("[coi] Reloading page to make use of updated service worker.");
                        window.sessionStorage.setItem("coiReloadedByCOI", "updatefound");
                        coi.doReload();
                    });

                    // If the registration is active, but not controlling the page
                    if (registration.active && !navigator.serviceWorker.controller) {
                        if (!coi.quiet) console.log("[coi] Reloading page to make use of service worker.");
                        window.sessionStorage.setItem("coiReloadedByCOI", "notcontrolling");
                        coi.doReload();
                    }
                },
                (err) => {
                    if (!coi.quiet) console.error("[coi] Service worker registration failed:", err);
                }
            );
        }
    })();
}
