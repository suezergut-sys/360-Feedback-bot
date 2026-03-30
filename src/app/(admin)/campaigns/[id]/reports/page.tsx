import { notFound } from "next/navigation";
import { CampaignTabs } from "@/components/campaign-tabs";
import { triggerAnalysisAction } from "@/app/(admin)/campaigns/actions";
import { requireAdminSession } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";

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

  const reports = await prisma.analysisReport.findMany({
    where: {
      campaignId: campaign.id,
    },
    include: {
      competency: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <section className="stack-lg">
      <div className="row-between">
        <h2>Отчеты: {campaign.title}</h2>
        <form action={triggerAnalysisAction}>
          <input type="hidden" name="campaignId" value={campaign.id} />
          <button type="submit" className="button primary">
            Перегенерировать отчеты
          </button>
        </form>
      </div>

      <CampaignTabs campaignId={campaign.id} />

      {reports.length === 0 ? (
        <div className="card">
          <p className="muted">Отчеты пока не сгенерированы.</p>
        </div>
      ) : (
        <div className="stack-md">
          {reports.map((report) => (
            <article key={report.id} className="card stack-sm">
              <div className="row-between">
                <h3>
                  {report.reportType === "overall"
                    ? "Общий отчет"
                    : `Компетенция: ${report.competency?.name ?? "unknown"}`}
                </h3>
                <span className="muted small">
                  v{report.version} | {report.createdAt.toLocaleString("ru-RU")}
                </span>
              </div>

              <pre className="markdown-preview">{report.contentMarkdown}</pre>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
