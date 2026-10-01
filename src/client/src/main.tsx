import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AdminRoute } from "./pages/admin/AdminPage";
import { ChatPage } from "./pages/chat/ChatPage";
import { LoginPage } from "./pages/login/LoginPage";
import { registerAppServiceWorker } from "./shared/service-worker-registration";
import { getJson } from "./api";
import type { RedirectResponse } from "./shared/types";
import "./styles.css";

type Theme = "cyberpunk" | "minimal";

const themeStorageKey = "va11-theme";

function readInitialTheme(): Theme {
  try {
    return window.localStorage.getItem(themeStorageKey) === "minimal" ? "minimal" : "cyberpunk";
  } catch {
    return "cyberpunk";
  }
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readInitialTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch {
      // Theme persistence is optional.
    }
  }, [theme]);

  const isNight = theme === "cyberpunk";

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-pressed={isNight}
      aria-label={`Switch to ${isNight ? "plain lights" : "night counter"} theme`}
      onClick={() => setTheme(isNight ? "minimal" : "cyberpunk")}
    >
      {isNight ? "Night counter" : "Plain lights"}
    </button>
  );
}

export function App() {
  const pathname = window.location.pathname;

  let page = <EntryPage />;

  if (pathname.startsWith("/admin")) page = <AdminRoute />;
  if (pathname.startsWith("/chat/")) {
    page = <ChatPage channelId={decodeURIComponent(pathname.split("/")[2] ?? "")} />;
  }

  return (
    <>
      <ThemeToggle />
      {page}
    </>
  );
}

function EntryPage() {
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    getJson<RedirectResponse>("/api/session")
      .then((result) => window.location.replace(result.redirectTo))
      .catch(() => setCheckingSession(false));
  }, []);

  if (checkingSession) {
    return (
      <main className="form-page">
        <div className="form-page__content">
          <p className="form-page__status form-page__status--notice" role="status">
            Warming a stool...
          </p>
        </div>
      </main>
    );
  }

  return <LoginPage />;
}

registerAppServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
