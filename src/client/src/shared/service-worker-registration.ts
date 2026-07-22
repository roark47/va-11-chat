export function registerAppServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

  const register = () => {
    void navigator.serviceWorker.register("/service-worker.js");
  };

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
