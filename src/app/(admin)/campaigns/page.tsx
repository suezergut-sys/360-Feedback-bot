import Link from "next/link";
import { listCampaigns } from "@/modules/campaigns/service";
import { requireAdminSession } from "@/lib/auth/admin";
import { StatusBadge } from "@/components/status-badge";
import { DeleteCampaignButton } from "@/components/delete-campaign-button";
import type { RespondentRole } from "@prisma/client";

type RoleCol = { label: string; role: RespondentRole };

const ROLE_COLS: RoleCol[] = [
  { label: "ОЦ", role: "self" },
  { label: "РУ", role: "manager" },
  { label: "КО", role: "colleague" },
  { label: "СО", role: "employee" },
  { label: "КЛ", role: "client" },
];

function roleStats(respondents: { role: RespondentRole; status: string }[], role: RespondentRole) {
  const group = respondents.filter((r) => r.role === role);
  const total = group.length;
  const completed = group.filter((r) => r.status === "completed").length;
  return { completed, total };
}

function RoleCell({ completed, total }: { completed: number; total: number }) {
  let color: string;
  if (total === 0) {
    color = "#ef4444"; // red
  } else if (completed === total) {
    color = "#16a34a"; // green
  } else {
    color = "#ca8a04"; // yellow/amber
  }
  return (
    <span style={{ color, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
      {completed}/{total}
    </span>
  );
}

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
                {ROLE_COLS.map((c) => (
                  <th key={c.role} title={c.role} style={{ textAlign: "center" }}>
                    {c.label}
                  </th>
                ))}
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
                  {ROLE_COLS.map((c) => {
                    const { completed, total } = roleStats(campaign.respondents, c.role);
                    return (
                      <td key={c.role} style={{ textAlign: "center" }}>
                        <RoleCell completed={completed} total={total} />
                      </td>
                    );
                  })}
                  <td className="row-gap">
                    <Link href={`/campaigns/${campaign.id}/edit`} className="link-inline">
                      Открыть
                    </Link>
                    <DeleteCampaignButton campaignId={campaign.id} campaignTitle={campaign.title} />
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
