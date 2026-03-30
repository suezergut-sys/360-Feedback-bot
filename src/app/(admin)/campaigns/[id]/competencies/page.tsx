import { notFound } from "next/navigation";
import { CampaignTabs } from "@/components/campaign-tabs";
import { requireAdminSession } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { createCompetencyAction, toggleCompetencyAction } from "@/app/(admin)/campaigns/actions";

function markersToString(markers: unknown): string {
  if (!Array.isArray(markers)) {
    return "";
  }

  return markers.map((item) => String(item)).join(", ");
}

export default async function CampaignCompetenciesPage({
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
      competencies: {
        orderBy: { priorityOrder: "asc" },
      },
    },
  });

  if (!campaign) {
    notFound();
  }

  return (
    <section className="stack-lg">
      <h2>Компетенции: {campaign.title}</h2>
      <CampaignTabs campaignId={campaign.id} />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Порядок</th>
              <th>Название</th>
              <th>Описание</th>
              <th>Маркеры</th>
              <th>Enabled</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {campaign.competencies.map((competency) => (
              <tr key={competency.id}>
                <td>{competency.priorityOrder}</td>
                <td>{competency.name}</td>
                <td>{competency.description}</td>
                <td>{markersToString(competency.behavioralMarkers)}</td>
                <td>{competency.enabled ? "Да" : "Нет"}</td>
                <td>
                  <form action={toggleCompetencyAction}>
                    <input type="hidden" name="campaignId" value={campaign.id} />
                    <input type="hidden" name="competencyId" value={competency.id} />
                    <input type="hidden" name="enabled" value={competency.enabled ? "false" : "true"} />
                    <button type="submit" className="button small">
                      {competency.enabled ? "Disable" : "Enable"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={createCompetencyAction} className="card form-grid">
        <input type="hidden" name="campaignId" value={campaign.id} />
        <h3>Добавить компетенцию</h3>

        <label className="form-label" htmlFor="name">
          Название
        </label>
        <input id="name" name="name" className="input" required />

        <label className="form-label" htmlFor="description">
          Описание
        </label>
        <textarea id="description" name="description" className="textarea" rows={3} required />

        <label className="form-label" htmlFor="behavioralMarkers">
          Behavioral markers (через запятую или с новой строки)
        </label>
        <textarea id="behavioralMarkers" name="behavioralMarkers" className="textarea" rows={3} required />

        <label className="form-label" htmlFor="priorityOrder">
          Порядок
        </label>
        <input id="priorityOrder" name="priorityOrder" type="number" className="input" min={1} defaultValue={1} />

        <input type="hidden" name="enabled" value="true" />

        <button type="submit" className="button primary">
          Добавить
        </button>
      </form>
    </section>
  );
}
