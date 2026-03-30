import Link from "next/link";
import { listCampaigns } from "@/modules/campaigns/service";
import { requireAdminSession } from "@/lib/auth/admin";
import { StatusBadge } from "@/components/status-badge";

export default async function CampaignsPage() {
  const admin = await requireAdminSession();
  const campaigns = await listCampaigns(admin.id);

  return (
    <section className="stack-lg">
      <div className="row-between">
        <h2>Кампании</h2>
        <Link href="/campaigns/new" className="button primary">
          Новая кампания
        </Link>
      </div>

      <div className="card">
        {campaigns.length === 0 ? (
          <p className="muted">Кампаний пока нет.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Оцениваемый</th>
                <th>Статус</th>
                <th>Респонденты</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td>{campaign.title}</td>
                  <td>{campaign.subjectName}</td>
                  <td>
                    <StatusBadge status={campaign.status} />
                  </td>
                  <td>{campaign._count.respondents}</td>
                  <td>
                    <Link href={`/campaigns/${campaign.id}/edit`} className="link-inline">
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
