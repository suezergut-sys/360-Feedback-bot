import Link from "next/link";
import { requireAdminSession } from "@/lib/auth/admin";
import { logoutAction } from "@/app/(admin)/actions";
import { AdminTopNav } from "@/components/admin-top-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdminSession();

  return (
    <div className="app-shell">
      <header className="header">
        <div>
          <p className="muted small">360 Feedback AI Bot</p>
          <h1 className="header-title">Админ-панель</h1>
          <p className="muted">{admin.email}</p>
        </div>

        <div className="header-actions">
          <AdminTopNav />
          <form action={logoutAction}>
            <button type="submit" className="button">
              Выйти
            </button>
          </form>
        </div>
      </header>

      <main className="main">{children}</main>

      <footer className="footer">
        <p>
          Webhook: <code>/api/telegram/webhook</code> | Jobs cron: <code>/api/cron/jobs</code>
        </p>
        <p>
          <Link href="/api/health">Health check</Link>
        </p>
      </footer>
    </div>
  );
}
