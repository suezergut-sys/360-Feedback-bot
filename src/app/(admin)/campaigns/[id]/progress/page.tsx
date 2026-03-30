import { notFound } from "next/navigation";
import { CampaignTabs } from "@/components/campaign-tabs";
import { requireAdminSession } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";

export default async function CampaignProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdminSession();
  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: {
      id,
      ownerAdminId: admin.id,
    },
    include: {
      respondents: true,
      sessions: {
        orderBy: { lastActivityAt: "desc" },
        include: {
          respondent: true,
        },
      },
    },
  });

  if (!campaign) {
    notFound();
  }

  const invited = campaign.respondents.filter((r) => r.status === "invited").length;
  const started = campaign.respondents.filter((r) => r.status === "started").length;
  const completed = campaign.respondents.filter((r) => r.status === "completed").length;

  return (
    <section className="stack-lg">
      <h2>Прогресс: {campaign.title}</h2>
      <CampaignTabs campaignId={campaign.id} />

      <div className="card stats-grid">
        <div className="stat-item">
          <span className="muted">Всего приглашено</span>
          <strong>{campaign.respondents.length}</strong>
        </div>
        <div className="stat-item">
          <span className="muted">Не начали</span>
          <strong>{invited}</strong>
        </div>
        <div className="stat-item">
          <span className="muted">В процессе</span>
          <strong>{started}</strong>
        </div>
        <div className="stat-item">
          <span className="muted">Завершили</span>
          <strong>{completed}</strong>
        </div>
      </div>

      <div className="card">
        <h3>Сессии</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Респондент</th>
              <th>Старт</th>
              <th>Последняя активность</th>
              <th>Завершено</th>
            </tr>
          </thead>
          <tbody>
            {campaign.sessions.map((session) => (
              <tr key={session.id}>
                <td>{session.respondent.displayName ?? session.respondent.id}</td>
                <td>{session.startedAt.toLocaleString("ru-RU")}</td>
                <td>{session.lastActivityAt.toLocaleString("ru-RU")}</td>
                <td>{session.completedAt ? session.completedAt.toLocaleString("ru-RU") : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
