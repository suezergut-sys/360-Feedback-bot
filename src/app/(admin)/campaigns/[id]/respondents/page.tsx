import { notFound } from "next/navigation";
import { CampaignTabs } from "@/components/campaign-tabs";
import { createRespondentAction } from "@/app/(admin)/campaigns/actions";
import { requireAdminSession } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { buildInviteLink } from "@/lib/telegram/client";
import { RESPONDENT_ROLE_LABELS } from "@/lib/validators/respondent";

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

      <form action={createRespondentAction} className="card stack-sm">
        <input type="hidden" name="campaignId" value={campaign.id} />
        <div className="form-grid">
          <label className="form-label" htmlFor="displayName">
            Имя респондента
          </label>
          <input id="displayName" name="displayName" className="input" placeholder="Например, Анна Козлова" />

          <label className="form-label" htmlFor="role">
            Роль
          </label>
          <select id="role" name="role" className="input">
            <option value="colleague">Коллега</option>
            <option value="self">Самооценка</option>
            <option value="manager">Руководитель</option>
            <option value="client">Клиент</option>
          </select>

          <label className="form-label" htmlFor="position">
            Должность
          </label>
          <input id="position" name="position" className="input" placeholder="Например, Старший аналитик" />

          <label className="form-label" htmlFor="department">
            Подразделение
          </label>
          <input id="department" name="department" className="input" placeholder="Например, Служба развития персонала" />
        </div>
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
                <th>Роль</th>
                <th>Должность</th>
                <th>Подразделение</th>
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
                    <td>{RESPONDENT_ROLE_LABELS[respondent.role] ?? respondent.role}</td>
                    <td>{respondent.position ?? "-"}</td>
                    <td>{respondent.department ?? "-"}</td>
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
