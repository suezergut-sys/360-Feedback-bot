"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerAnalysisAction } from "@/app/(admin)/campaigns/actions";

export function RegenerateButton({ campaignId }: { campaignId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    const formData = new FormData();
    formData.append("campaignId", campaignId);
    startTransition(async () => {
      await triggerAnalysisAction(formData);
      router.refresh();
    });
  }

  return (
    <button onClick={handleClick} disabled={isPending} className="button primary">
      {isPending ? "Генерация..." : "Перегенерировать отчёт"}
    </button>
  );
}
