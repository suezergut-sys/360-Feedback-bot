import { notFound } from "next/navigation";
import { CampaignTabs } from "@/components/campaign-tabs";
import { requireAdminSession } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { RegenerateButton } from "./RegenerateButton";

export default async function CampaignReportsPage({
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
    select: {
      id: true,
      title: true,
    },
  });

  if (!campaign) {
    notFound();
  }

  const latestReport = await prisma.analysisReport.findFirst({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return (
    <section className="stack-lg">
      <div className="row-between">
        <div>
          <h2>Отчёт: {campaign.title}</h2>
          {latestReport && (
            <p className="muted small" style={{ marginTop: "4px" }}>
              Последняя генерация:{" "}
              {latestReport.createdAt.toLocaleString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Moscow",
              })}{" "}(МСК)
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <a
            href={`/api/campaigns/${campaign.id}/reports/html`}
            download
            className="button"
          >
            Скачать HTML
          </a>
          <a
            href={`/api/campaigns/${campaign.id}/reports/html?print=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="button"
          >
            Скачать PDF
          </a>
          <RegenerateButton campaignId={campaign.id} currentTs={latestReport?.createdAt.toISOString() ?? null} />
        </div>
      </div>

      <CampaignTabs campaignId={campaign.id} />

      {!latestReport ? (
        <div className="card">
          <p className="muted">Отчёты пока не сгенерированы. Нажмите «Перегенерировать отчёт».</p>
        </div>
      ) : (
        <iframe
          src={`/api/campaigns/${campaign.id}/reports/html?embed=1`}
          style={{
            width: "100%",
            height: "calc(100vh - 220px)",
            border: "1px solid var(--border, #e2e8f0)",
            borderRadius: "8px",
            background: "#fff",
          }}
          title="Визуальный отчёт"
        />
      )}
    </section>
  );
}
