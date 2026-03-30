import Link from "next/link";
import { env } from "@/lib/env";

export default async function TelegramStartPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";

  const botUrl = env.TELEGRAM_BOT_USERNAME
    ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(token)}`
    : null;

  return (
    <main className="centered-page">
      <section className="card auth-card stack-md">
        <h1>Старт интервью</h1>
        <p className="muted">
          Откройте Telegram-бота и отправьте команду <code>/start {token || "<token>"}</code>.
        </p>
        {botUrl ? (
          <Link href={botUrl} className="button primary">
            Открыть Telegram-бота
          </Link>
        ) : (
          <p className="muted">Переменная TELEGRAM_BOT_USERNAME не настроена.</p>
        )}
      </section>
    </main>
  );
}
