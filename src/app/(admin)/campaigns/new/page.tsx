import Link from "next/link";
import { createCampaignAction } from "@/app/(admin)/campaigns/actions";

const ERROR_MESSAGES: Record<string, string> = {
  campaign_validation:
    "Проверьте поля кампании: приветственное и финальное сообщения должны быть не короче 10 символов.",
};

export default async function CreateCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorText = params.error ? ERROR_MESSAGES[params.error] : undefined;

  return (
    <section className="stack-lg">
      <div className="row-between">
        <h2>Новая кампания</h2>
        <Link href="/campaigns" className="link-inline">
          Назад
        </Link>
      </div>

      {errorText ? <p className="error-text">{errorText}</p> : null}

      <form action={createCampaignAction} className="card form-grid">
        <label className="form-label" htmlFor="title">
          Название
        </label>
        <input id="title" name="title" className="input" required />

        <label className="form-label" htmlFor="description">
          Описание
        </label>
        <textarea id="description" name="description" className="textarea" required rows={3} />

        <label className="form-label" htmlFor="subjectName">
          Оцениваемый сотрудник
        </label>
        <input id="subjectName" name="subjectName" className="input" required />

        <label className="form-label" htmlFor="status">
          Статус
        </label>
        <select id="status" name="status" className="input" defaultValue="draft">
          <option value="draft">draft</option>
          <option value="active">active</option>
          <option value="paused">paused</option>
          <option value="completed">completed</option>
          <option value="archived">archived</option>
        </select>

        <label className="form-label" htmlFor="language">
          Язык
        </label>
        <input id="language" name="language" className="input" defaultValue="ru" required />

        <label className="form-label" htmlFor="welcomeMessage">
          Welcome message
        </label>
        <textarea
          id="welcomeMessage"
          name="welcomeMessage"
          className="textarea"
          required
          minLength={10}
          rows={4}
        />

        <label className="form-label" htmlFor="closingMessage">
          Closing message
        </label>
        <textarea
          id="closingMessage"
          name="closingMessage"
          className="textarea"
          required
          minLength={10}
          rows={4}
        />

        <button className="button primary" type="submit">
          Создать кампанию
        </button>
      </form>
    </section>
  );
}
