import { useState } from "react";
import { postForm } from "../../api";
import type { RedirectResponse } from "../../shared/types";
import "../login/login-page.css";
import "./admin-login-page.css";

export function AdminLoginPage() {
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const form = new FormData(event.currentTarget);
      const result = await postForm<RedirectResponse>("/api/admin/login", {
        password: String(form.get("password") ?? ""),
      });
      window.location.href = result.redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The staff hatch stayed shut");
    }
  }

  return (
    <main className="form-page admin-login-page">
      <div className="form-page__content">
        <h1 className="form-page__title">Staff Hatch</h1>
        <p className="form-page__status form-page__status--error" aria-live="polite">
          {error}
        </p>
        <form className="form-page__form" onSubmit={submit}>
          <p className="form-page__field">
            <label className="form-page__label">
              Slide in the house key
              <br />
              <input className="form-page__control" name="password" type="password" required />
            </label>
          </p>
          <button className="form-page__button button--primary" type="submit">
            Start the shift
          </button>
        </form>
        <p className="form-page__link-row">
          <a href="/">Back to the front door</a>
        </p>
      </div>
    </main>
  );
}
