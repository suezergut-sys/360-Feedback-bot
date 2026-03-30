import { notFound } from "next/navigation";
import { CampaignTabs } from "@/components/campaign-tabs";
import { createRespondentAction } from "@/app/(admin)/campaigns/actions";
import { requireAdminSession } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { buildInviteLink } from "@/lib/telegram/client";

export default async function CampaignRespondentsPage({
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
      respondents: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!campaign) {
    notFound();
  }

  return (
    <section className="stack-lg">
      <h2>Респонденты: {campaign.title}</h2>
      <CampaignTabs campaignId={campaign.id} />

      <form action={createRespondentAction} className="card form-grid">
        <input type="hidden" name="campaignId" value={campaign.id} />
        <label className="form-label" htmlFor="displayName">
          Имя респондента
        </label>
        <input id="displayName" name="displayName" className="input" placeholder="Например, Анна Козлова" />
        <button type="submit" className="button primary">
          Добавить респондента
        </button>
      </form>

      <div className="card">
        {campaign.respondents.length === 0 ? (
          <p className="muted">Респондентов пока нет.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Статус</th>
                <th>Telegram</th>
                <th>Инвайт</th>
              </tr>
            </thead>
            <tbody>
              {campaign.respondents.map((respondent) => {
                const inviteLink = buildInviteLink(respondent.inviteToken);

                return (
                  <tr key={respondent.id}>
                    <td>{respondent.displayName ?? "Без имени"}</td>
                    <td>{respondent.status}</td>
                    <td>{respondent.telegramUsername ? `@${respondent.telegramUsername}` : "-"}</td>
                    <td>
                      <input readOnly value={inviteLink} className="input mono" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
