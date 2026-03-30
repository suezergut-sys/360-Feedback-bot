import Link from "next/link";
import { notFound } from "next/navigation";
import { updateCampaignAction } from "@/app/(admin)/campaigns/actions";
import { requireAdminSession } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { CampaignTabs } from "@/components/campaign-tabs";

export default async function EditCampaignPage({
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
  });

  if (!campaign) {
    notFound();
  }

  return (
    <section className="stack-lg">
      <div className="row-between">
        <h2>{campaign.title}</h2>
        <Link href="/campaigns" className="link-inline">
          Назад к списку
        </Link>
      </div>

      <CampaignTabs campaignId={campaign.id} />

      <form action={updateCampaignAction} className="card form-grid">
        <input type="hidden" name="campaignId" value={campaign.id} />

        <label className="form-label" htmlFor="title">
          Название
        </label>
        <input id="title" name="title" className="input" defaultValue={campaign.title} required />

        <label className="form-label" htmlFor="description">
          Описание
        </label>
        <textarea
          id="description"
          name="description"
          className="textarea"
          defaultValue={campaign.description}
          rows={3}
          required
        />

        <label className="form-label" htmlFor="subjectName">
          Оцениваемый сотрудник
        </label>
        <input
          id="subjectName"
          name="subjectName"
          className="input"
          defaultValue={campaign.subjectName}
          required
        />

        <label className="form-label" htmlFor="status">
          Статус
        </label>
        <select id="status" name="status" className="input" defaultValue={campaign.status}>
          <option value="draft">draft</option>
          <option value="active">active</option>
          <option value="paused">paused</option>
          <option value="completed">completed</option>
          <option value="archived">archived</option>
        </select>

        <label className="form-label" htmlFor="language">
          Язык
        </label>
        <input id="language" name="language" className="input" defaultValue={campaign.language} required />

        <label className="form-label" htmlFor="welcomeMessage">
          Welcome message
        </label>
        <textarea
          id="welcomeMessage"
          name="welcomeMessage"
          className="textarea"
          defaultValue={campaign.welcomeMessage}
          rows={4}
          required
        />

        <label className="form-label" htmlFor="closingMessage">
          Closing message
        </label>
        <textarea
          id="closingMessage"
          name="closingMessage"
          className="textarea"
          defaultValue={campaign.closingMessage}
          rows={4}
          required
        />

        <button className="button primary" type="submit">
          Сохранить изменения
        </button>
      </form>
    </section>
  );
}
