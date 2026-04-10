"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { triggerAnalysisAction } from "@/app/(admin)/campaigns/actions";

export function RegenerateButton({
  campaignId,
  currentTs,
}: {
  campaignId: string;
  currentTs: string | null;
}) {
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setIsPending(true);

    const formData = new FormData();
    formData.append("campaignId", campaignId);
    await triggerAnalysisAction(formData);

    // Poll until the report timestamp changes (generation completed)
    const deadline = Date.now() + 120_000; // 2 minutes max
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/reports/latest-ts`);
        const { ts } = await res.json() as { ts: string | null };
        if (ts && ts !== currentTs) {
          router.refresh();
          setIsPending(false);
          return;
        }
      } catch {
        // ignore fetch errors, keep polling
      }
    }

    // Timed out — refresh anyway
    router.refresh();
    setIsPending(false);
  }

  return (
    <button onClick={handleClick} disabled={isPending} className="button primary">
      {isPending ? "Генерация..." : "Перегенерировать отчёт"}
    </button>
  );
}
