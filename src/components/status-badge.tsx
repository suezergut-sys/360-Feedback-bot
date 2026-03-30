import { CampaignStatus } from "@prisma/client";

export function StatusBadge({ status }: { status: CampaignStatus | string }) {
  const className = `badge badge-${status}`;
  return <span className={className}>{status}</span>;
}
