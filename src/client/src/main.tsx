import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminRoute } from "./pages/admin/AdminPage";
import { ChatPage } from "./pages/chat/ChatPage";
import { LoginPage } from "./pages/login/LoginPage";
import "./styles.css";

export function App() {
  const pathname = window.location.pathname;

  if (pathname.startsWith("/admin")) return <AdminRoute />;
  if (pathname.startsWith("/chat/")) {
    return <ChatPage channelId={decodeURIComponent(pathname.split("/")[2] ?? "")} />;
  }

  return <LoginPage />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
