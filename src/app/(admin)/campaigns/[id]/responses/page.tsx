import { notFound } from "next/navigation";
import { CampaignTabs } from "@/components/campaign-tabs";
import { requireAdminSession } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";

export default async function CampaignResponsesPage({
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

  const messages = await prisma.message.findMany({
    where: {
      session: {
        campaignId: campaign.id,
      },
    },
    include: {
      session: {
        include: {
          respondent: true,
        },
      },
      competency: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 500,
  });

  return (
    <section className="stack-lg">
      <h2>Сырые ответы: {campaign.title}</h2>
      <CampaignTabs campaignId={campaign.id} />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Время</th>
              <th>Респондент</th>
              <th>Компетенция</th>
              <th>Тип</th>
              <th>Отправитель</th>
              <th>Текст / Транскрипт</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((message) => (
              <tr key={message.id}>
                <td>{message.createdAt.toLocaleString("ru-RU")}</td>
                <td>{message.session.respondent.displayName ?? message.session.respondent.id}</td>
                <td>{message.competency?.name ?? "-"}</td>
                <td>{message.messageType}</td>
                <td>{message.senderType}</td>
                <td>{message.transcriptText ?? message.rawText ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
