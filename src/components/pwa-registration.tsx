"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    let disposed = false;

    const register = async () => {
      let registration: ServiceWorkerRegistration;

      try {
        registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
      } catch (error) {
        if (!disposed) {
          console.warn("JobSwipe could not enable its offline fallback.", error);
        }

        return;
      }

      if (!registration.active) {
        return;
      }

      try {
        await registration.update();
      } catch (error) {
        if (!disposed) {
          console.warn("JobSwipe could not check for an offline fallback update.", error);
        }
      }
    };

    if (document.readyState === "complete") {
      void register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      disposed = true;
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
