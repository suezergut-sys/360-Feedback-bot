"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteCampaignButton({ campaignId, campaignTitle }: { campaignId: string; campaignTitle: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    const confirmed = window.confirm(
      `Удалить кампанию «${campaignTitle}»?\n\nВместе с ней будут удалены все ответы респондентов, сессии и отчёты. Это действие нельзя отменить.`,
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Ошибка при удалении. Попробуйте ещё раз.");
        return;
      }

      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={handleDelete} disabled={busy} className="link-inline danger">
      {busy ? "Удаление…" : "Удалить"}
    </button>
  );
}
