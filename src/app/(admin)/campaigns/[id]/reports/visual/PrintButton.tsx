"use client";

export function PrintButton({ campaignId }: { campaignId: string }) {
  return (
    <>
      <button type="button" onClick={() => window.print()}>
        Печать / Сохранить PDF
      </button>
      <a href={`/api/campaigns/${campaignId}/reports/html`} download>
        Скачать HTML
      </a>
    </>
  );
}
