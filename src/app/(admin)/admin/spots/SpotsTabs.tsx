import Link from "next/link";

/**
 * 「촬영 장소」 안의 탭 — 장소 정보(이름·주소·키워드·공개)와, 장소마다 걸리는 사진(spot_photos, 0145).
 *
 * 상단 내비에서는 한 칸(촬영 장소)이다. 둘 다 같은 장소를 다루는 지면이라 메뉴를 늘리지 않고 안에서 나눈다.
 */
const TABS = [
  { key: "info", href: "/admin/spots", label: "장소 정보" },
  { key: "photos", href: "/admin/spots/photos", label: "장소별 사진" },
] as const;

export function SpotsTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="mb-5 flex gap-1 border-b border-line" aria-label="촬영 장소">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
            t.key === current ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
