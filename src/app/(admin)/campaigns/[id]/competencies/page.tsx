import { notFound } from "next/navigation";
import { CampaignTabs } from "@/components/campaign-tabs";
import { requireAdminSession } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { createCompetencyAction, toggleCompetencyAction, updateCompetencyAction } from "@/app/(admin)/campaigns/actions";

function markersToString(markers: unknown): string {
  if (!Array.isArray(markers)) {
    return "";
  }

  return markers.map((item) => String(item)).join(", ");
}

function markersToMultiline(markers: unknown): string {
  if (!Array.isArray(markers)) {
    return "";
  }

  return markers.map((item) => String(item)).join("\n");
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
                  <div className="stack-sm">
                    <form action={toggleCompetencyAction}>
                      <input type="hidden" name="campaignId" value={campaign.id} />
                      <input type="hidden" name="competencyId" value={competency.id} />
                      <input type="hidden" name="enabled" value={competency.enabled ? "false" : "true"} />
                      <button type="submit" className="button small">
                        {competency.enabled ? "Disable" : "Enable"}
                      </button>
                    </form>

                    <details>
                      <summary>Редактировать</summary>
                      <form action={updateCompetencyAction} className="form-grid" style={{ marginTop: "0.5rem" }}>
                        <input type="hidden" name="campaignId" value={campaign.id} />
                        <input type="hidden" name="competencyId" value={competency.id} />

                        <label className="form-label" htmlFor={`name-${competency.id}`}>
                          Название
                        </label>
                        <input
                          id={`name-${competency.id}`}
                          name="name"
                          className="input"
                          defaultValue={competency.name}
                          required
                        />

                        <label className="form-label" htmlFor={`description-${competency.id}`}>
                          Описание
                        </label>
                        <textarea
                          id={`description-${competency.id}`}
                          name="description"
                          className="textarea"
                          rows={3}
                          defaultValue={competency.description}
                          required
                        />

                        <label className="form-label" htmlFor={`markers-${competency.id}`}>
                          Behavioral markers
                        </label>
                        <textarea
                          id={`markers-${competency.id}`}
                          name="behavioralMarkers"
                          className="textarea"
                          rows={3}
                          defaultValue={markersToMultiline(competency.behavioralMarkers)}
                          required
                        />

                        <label className="form-label" htmlFor={`order-${competency.id}`}>
                          Порядок
                        </label>
                        <input
                          id={`order-${competency.id}`}
                          name="priorityOrder"
                          type="number"
                          className="input"
                          min={1}
                          defaultValue={competency.priorityOrder}
                          required
                        />

                        <label className="form-label" htmlFor={`enabled-${competency.id}`}>
                          Статус
                        </label>
                        <select
                          id={`enabled-${competency.id}`}
                          name="enabled"
                          className="input"
                          defaultValue={competency.enabled ? "true" : "false"}
                        >
                          <option value="true">Включено</option>
                          <option value="false">Выключено</option>
                        </select>

                        <button type="submit" className="button primary small">
                          Сохранить
                        </button>
                      </form>
                    </details>
                  </div>
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
