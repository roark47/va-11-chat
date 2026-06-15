import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AdminRoute } from "./pages/admin/AdminPage";
import { ChatPage } from "./pages/chat/ChatPage";
import { LoginPage } from "./pages/login/LoginPage";
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

  const isCyberpunk = theme === "cyberpunk";

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-pressed={isCyberpunk}
      aria-label={`Switch to ${isCyberpunk ? "minimal" : "cyberpunk"} theme`}
      onClick={() => setTheme(isCyberpunk ? "minimal" : "cyberpunk")}
    >
      {isCyberpunk ? "Cyberpunk" : "Minimal"}
    </button>
  );
}

export function App() {
  const pathname = window.location.pathname;

  let page = <LoginPage />;

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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
