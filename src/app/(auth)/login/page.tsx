import type { Metadata } from "next";
import { loginAction } from "@/app/(auth)/login/actions";

export const metadata: Metadata = {
  title: "Вход | 360 Feedback AI Bot",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Неверный email или пароль.",
  too_many_requests: "Слишком много попыток входа. Попробуйте позже.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? ERROR_MESSAGES[params.error] : undefined;

  return (
    <main className="centered-page">
      <section className="card auth-card">
        <h1>360 Feedback AI Bot</h1>
        <p className="muted">Вход администратора</p>

        {error ? <p className="error-text">{error}</p> : null}

        <form action={loginAction} className="form-grid">
          <label className="form-label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" required className="input" />

          <label className="form-label" htmlFor="password">
            Пароль
          </label>
          <input id="password" name="password" type="password" required className="input" />

          <button type="submit" className="button primary">
            Войти
          </button>
        </form>
      </section>
    </main>
  );
}
