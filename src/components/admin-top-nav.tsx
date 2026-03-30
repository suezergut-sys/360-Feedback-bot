import Link from "next/link";

const NAV_ITEMS = [
  { href: "/campaigns", label: "Кампании" },
];

export function AdminTopNav() {
  return (
    <nav className="top-nav">
      {NAV_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className="top-nav-link">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
