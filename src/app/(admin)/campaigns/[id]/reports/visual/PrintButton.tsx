"use client";

export function PrintButton({ campaignId }: { campaignId: string }) {
  return (
    <>
      <a
        href={`/api/campaigns/${campaignId}/reports/html?print=1`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Печать / Сохранить PDF
      </a>
      <a href={`/api/campaigns/${campaignId}/reports/html`} download>
        Скачать HTML
      </a>
    </>
  );
}
