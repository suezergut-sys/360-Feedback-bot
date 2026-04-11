import Link from "next/link";

type Props = {
  campaignId: string;
};

const TABS = [
  { slug: "edit", label: "Настройки" },
  { slug: "competencies", label: "Компетенции" },
  { slug: "respondents", label: "Респонденты" },
  { slug: "progress", label: "Прогресс" },
{ slug: "reports", label: "Отчеты" },
];

export function CampaignTabs({ campaignId }: Props) {
  return (
    <div className="tabs">
      {TABS.map((tab) => (
        <Link
          key={tab.slug}
          href={`/campaigns/${campaignId}/${tab.slug}`}
          className="tab-link"
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
