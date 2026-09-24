"use client";

import { useEffect } from "react";

/**
 * يسجّل `public/sw.js` في الإنتاج فقط.
 *
 * In development a service worker caches whatever the dev server returns and
 * then serves it back after the code has changed, which looks exactly like a
 * bug in the code. So registration is production-only, and it waits for the
 * page to finish loading so it never competes with the first paint on a slow
 * connection — the very connection it exists for.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((e) => console.error("service worker: registration failed", e));
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
