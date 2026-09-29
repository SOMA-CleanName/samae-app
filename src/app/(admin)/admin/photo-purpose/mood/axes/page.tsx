import { redirect } from "next/navigation";

// 축 배정은 검색어 정리와 한 화면으로 합쳤다(2026-09-19). 옛 링크는 축을 들고 그리로 간다.
export default async function MoodAxesPage({ searchParams }: { searchParams: Promise<{ axis?: string; q?: string }> }) {
  const { axis, q } = await searchParams;
  const query = new URLSearchParams(Object.entries({ axis, q }).filter((entry): entry is [string, string] => !!entry[1]));
  redirect(`/admin/photo-purpose/mood/terms${query.size ? `?${query}` : ""}`);
}
