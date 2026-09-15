import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeMoodUsage, type MoodPhoto } from "@/lib/admin-mood-usage";
import { MoodAxisSelect } from "./MoodAxisSelect";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/mood";
const SIZE = 50;
const AXES = ["감정", "관계", "스타일", "온도", "계절", "빛", "색감", "질감", "에너지", "공간", "general", "unassigned"];
const axisLabel = (axis: string) => axis === "general" ? "일반 어휘" : axis === "unassigned" ? "판단 보류" : axis;
const CLASSIFICATION: Record<string, string> = { editorial: "편집 초안", mood: "자동 분류 · 미검수", general: "일반 어휘", pending: "판단 보류" };
const STATUS: Record<string, string> = { collected: "수집 후보", shortlisted: "검증 후보", approved: "채택", rejected: "제외" };
type Params = { view?: string; q?: string; axis?: string; page?: string };
type Candidate = { id: string; label: string; browsing_axis: string; selection_status: string; classification_kind: string };

export default async function AdminPhotoMoodPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const view = ["all", "shortlisted", "approved", "used"].includes(params.view ?? "") ? params.view! : "all";
  const q = (params.q ?? "").trim().slice(0, 100);
  const axis = view !== "used" && AXES.includes(params.axis ?? "") ? params.axis! : "";
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.page) || 1)));
  const admin = createAdminClient();
  const countCandidates = async (status?: string) => {
    let query = admin.from("mood_candidates").select("id", { count: "exact", head: true });
    if (status) query = query.eq("selection_status", status);
    const { count, error } = await query;
    if (error) throw new Error("무드 후보 집계를 불러오지 못했습니다.");
    return count ?? 0;
  };
  const getPhotos = async () => {
    const photos: MoodPhoto[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.from("photos").select("id,mood_tags,auto_mood_tags")
        .eq("visibility", "published").order("id").range(offset, offset + 999);
      if (error) throw new Error("실사용 무드 집계를 불러오지 못했습니다.");
      photos.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
    return summarizeMoodUsage(photos);
  };
  const [all, shortlisted, approved, summary] = await Promise.all([
    countCandidates(), countCandidates("shortlisted"), countCandidates("approved"), getPhotos(),
  ]);
  const url = (changes: Params) => {
    const values = { view, q, axis, page: "1", ...changes };
    return `${BASE}?${new URLSearchParams(Object.entries(values).filter(([, value]) => value))}`;
  };
  const used = [...summary.usage.values()].filter((row) => row.label.includes(q))
    .sort((a, b) => b.photos - a.photos || a.label.localeCompare(b.label, "ko"));
  let total = used.length;
  let candidates: Candidate[] = [];
  if (view !== "used") {
    const filtered = () => {
      let query = admin.from("mood_catalog").select("id,label,browsing_axis,selection_status,classification_kind", { count: "exact" });
      if (view !== "all") query = query.eq("selection_status", view);
      if (axis) query = query.eq("browsing_axis", axis);
      if (q) query = query.ilike("label", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
      return query;
    };
    // Read count before paging so a stale/out-of-range URL cannot cause HTTP 416.
    const first = await filtered().order("label").order("id").range(0, SIZE - 1);
    if (first.error) throw new Error("무드 목록을 불러오지 못했습니다.");
    total = first.count ?? 0;
    if (page > Math.max(1, Math.ceil(total / SIZE))) redirect(url({ page: String(Math.max(1, Math.ceil(total / SIZE))) }));
    const result = page === 1 ? first : await filtered().order("label").order("id").range((page - 1) * SIZE, page * SIZE - 1);
    if (result.error) throw new Error("무드 목록을 불러오지 못했습니다.");
    candidates = result.data ?? [];
  }
  const pages = Math.max(1, Math.ceil(total / SIZE));
  if (page > pages) redirect(url({ page: String(pages) }));
  const usageFor = (label: string) => summary.usage.get(label.normalize("NFKC").trim().replace(/\s+/gu, " "));
  const tabs = [
    { key: "all", label: "전체 무드 보기", count: all },
    { key: "shortlisted", label: "검증 후보", count: shortlisted },
    { key: "approved", label: "확정 무드", count: approved },
    { key: "used", label: "기존 사진 참고 어휘", count: summary.usage.size },
  ];
  return (
    <section aria-labelledby="mood-heading">
      <h2 id="mood-heading" className="text-h2 font-semibold">무드</h2>
      <p className="mt-1 text-body-sm text-muted">현재 사용할 대상은 검증 후보입니다. 전체 어휘의 분류는 앞으로 후보를 확장하기 위한 참고 자료입니다.</p>
      <nav aria-label="무드 목록" className="my-5 flex flex-wrap gap-2">
        {tabs.map((tab) => <Link key={tab.key} href={url({ view: tab.key, axis: tab.key === "used" ? "" : axis })}
          aria-current={view === tab.key ? "page" : undefined}
          className={`rounded-xl border px-4 py-3 text-body-sm ${view === tab.key ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>
          {tab.label} <strong className="ml-2 tabular-nums">{tab.count.toLocaleString("ko-KR")}</strong>
        </Link>)}
      </nav>
      <div className="mb-5 rounded-xl border border-line p-4 text-body-sm">
        <p>공개 사진 <strong>{summary.totalPhotos.toLocaleString("ko-KR")}장</strong> · 무드 지정 {summary.taggedPhotos.toLocaleString("ko-KR")}장 · 무드 미지정 {summary.untaggedPhotos.toLocaleString("ko-KR")}장</p>
        <p className="mt-2 text-caption text-muted">기존 사진의 태그는 참고 어휘이며, 앞으로 사용할 확정 무드가 아닙니다. 같은 사진의 중복은 한 번만 셉니다.</p>
      </div>
      <form action={BASE} className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="view" value={view} />
        <input key={`q-${q}`} name="q" defaultValue={q} maxLength={100} aria-label="무드 단어 검색" placeholder="무드 단어 검색"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-2" />
        {view !== "used" && <MoodAxisSelect key={`axis-${axis}`} axis={axis} axes={AXES} />}
        <button className="rounded-xl bg-fg px-5 py-2 text-bg">검색</button>
        <Link href={`${BASE}?view=${view}`} className="rounded-xl border border-line px-4 py-2">초기화</Link>
      </form>
      <p className="mb-3 text-caption text-muted">검색 결과 {total.toLocaleString("ko-KR")}개 · {view === "used" ? "사용 사진 수 순" : "이름순"} · 메뉴 개수는 필터와 관계없는 전체 집계입니다.</p>
      {view === "all" && <p className="mb-3 text-caption text-muted">사전 의미와 명시적 표현을 기준으로 1차 분류했습니다. 사진에 적합하다는 판정은 아니며, 의미가 겹치거나 근거가 부족하면 판단 보류로 남깁니다.</p>}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-body-sm">
          <thead className="border-b border-line text-muted"><tr><th className="p-3">무드 표현</th><th className="p-3">{view === "used" ? "수동 지정 사진" : "축"}</th>{view !== "used" && <th className="p-3">분류 근거</th>}<th className="p-3">{view === "used" ? "자동 지정 사진" : "상태"}</th><th className="p-3">참고 사진</th></tr></thead>
          <tbody>{view === "used" ? used.slice((page - 1) * SIZE, page * SIZE).map((row) => <tr key={row.label} className="border-b border-line last:border-0">
            <td className="p-3 font-medium">{row.label}</td><td className="p-3">{row.manual}장</td><td className="p-3">{row.auto}장</td><td className="p-3">{row.photos}장</td>
          </tr>) : candidates.map((row) => <tr key={row.id} className="border-b border-line last:border-0">
            <td className="p-3 font-medium">{row.label}</td><td className="p-3">{axisLabel(row.browsing_axis)}</td><td className="p-3">{CLASSIFICATION[row.classification_kind] ?? "판단 보류"}</td><td className="p-3">{STATUS[row.selection_status] ?? row.selection_status}</td><td className="p-3">{usageFor(row.label)?.photos ?? 0}장</td>
          </tr>)}</tbody>
        </table>
        {!total && <p className="p-8 text-center text-muted">표시할 무드가 없습니다.</p>}
      </div>
      {view === "used" && <p className="mt-2 text-caption text-muted">수동·자동 지정이 함께 있으면 각 열에는 포함되지만, 사용 사진 수에서는 한 번만 셉니다. 의미가 비슷한 다른 표현은 자동으로 합치지 않습니다.</p>}
      <nav aria-label="무드 페이지" className="mt-4 flex items-center justify-between text-body-sm">
        {page > 1 ? <Link href={url({ page: String(page - 1) })}>이전</Link> : <span className="text-muted">이전</span>}
        <span>{page} / {pages}</span>
        {page < pages ? <Link href={url({ page: String(page + 1) })}>다음</Link> : <span className="text-muted">다음</span>}
      </nav>
    </section>
  );
}
