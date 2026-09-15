import Link from "next/link";
import { redirect } from "next/navigation";
import { loadGraph, loadVerdicts } from "@/lib/mood-review-data";
import { selectGroups, type Sense } from "@/lib/mood-review";
import { GroupCard } from "./GroupCard";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/mood/review";
const SIZE = 25;
type Params = { q?: string; size?: string; state?: string; page?: string };

export default async function MoodReviewPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 60);
  const size = ["big", "mid", "solo"].includes(params.size ?? "") ? params.size! : "big";
  const state = ["todo", "done"].includes(params.state ?? "") ? params.state! : "";
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.page) || 1)));

  const [{ groups, senses }, verdicts] = await Promise.all([loadGraph(), loadVerdicts()]);
  const filtered = selectGroups(groups, verdicts, { q, size, state });
  const pages = Math.max(1, Math.ceil(filtered.length / SIZE));
  if (page > pages) redirect(`${BASE}?${new URLSearchParams({ q, size, state, page: String(pages) })}`);
  const shown = filtered.slice((page - 1) * SIZE, page * SIZE);

  // 이 페이지에 뜬 낱말의 뜻풀이만 내려보낸다. 5,176개를 통째로 보내면 응답이 무거워진다.
  const localSenses: Record<string, Sense> = {};
  for (const group of shown) {
    for (const word of [group.head, ...group.members]) {
      if (senses[word]) localSenses[word] = senses[word];
    }
  }

  const url = (changes: Params) =>
    `${BASE}?${new URLSearchParams(Object.entries({ q, size, state, page: "1", ...changes }).filter(([, v]) => v))}`;
  const counts = {
    total: groups.length,
    done: Object.keys(verdicts).length,
    big: groups.filter((g) => g.members.length >= 5).length,
    mid: groups.filter((g) => g.members.length >= 1 && g.members.length <= 4).length,
    solo: groups.filter((g) => !g.members.length).length,
  };
  const tabs = [
    { key: "big", label: "식구 5개 이상", count: counts.big },
    { key: "mid", label: "식구 1~4개", count: counts.mid },
    { key: "solo", label: "홀로", count: counts.solo },
  ];

  return (
    <section aria-labelledby="review-heading">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="review-heading" className="text-h2 font-semibold">무드 그래프 1차 검수</h2>
        <Link href="/admin/photo-purpose/mood" className="text-body-sm text-muted underline hover:text-fg">무드 목록으로</Link>
      </div>
      <p className="mt-1 text-body-sm text-muted">
        무드 낱말 5,176개를 뜻이 같은 것끼리 묶고 각 묶음의 대표를 정한 결과입니다. 대표만 화면에 보이고 식구는 검색어로 살아 있습니다.
        <b className="text-fg"> 판정은 파일에만 기록되며 DB에는 아무것도 쓰지 않습니다.</b>
      </p>

      <nav aria-label="묶음 크기" className="my-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link key={tab.key} href={url({ size: tab.key })} aria-current={size === tab.key ? "page" : undefined}
            className={`rounded-xl border px-4 py-3 text-body-sm ${size === tab.key ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>
            {tab.label} <strong className="ml-2 tabular-nums">{tab.count.toLocaleString("ko-KR")}</strong>
          </Link>
        ))}
        <span className="ml-auto self-center text-body-sm text-muted">
          판정 <strong className="tabular-nums text-fg">{counts.done.toLocaleString("ko-KR")}</strong> / {counts.total.toLocaleString("ko-KR")}
        </span>
      </nav>

      <form action={BASE} className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="size" value={size} />
        <input key={`q-${q}`} name="q" defaultValue={q} maxLength={60} aria-label="낱말·영어 프롬프트 검색"
          placeholder="낱말이나 영어 프롬프트로 검색"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-2" />
        <select key={`s-${state}`} name="state" defaultValue={state} aria-label="판정 여부"
          className="rounded-xl border border-line bg-bg px-4 py-2 text-body-sm">
          <option value="">판정 전체</option>
          <option value="todo">아직 안 본 것</option>
          <option value="done">판정한 것</option>
        </select>
        <button className="rounded-xl bg-fg px-5 py-2 text-bg">검색</button>
        <Link href={`${BASE}?size=${size}`} className="rounded-xl border border-line px-4 py-2">초기화</Link>
      </form>

      <p className="mb-3 text-caption text-muted">
        {filtered.length.toLocaleString("ko-KR")}개 · 식구 많은 순 · 판정은 누르는 즉시 저장됩니다
      </p>

      <ul className="space-y-3">
        {shown.map((group) => (
          <GroupCard key={group.head} head={group.head} members={group.members} prompts={group.prompts}
            senses={localSenses} verdict={verdicts[group.head]} />
        ))}
      </ul>
      {!filtered.length && <p className="rounded-xl border border-line p-8 text-center text-muted">해당하는 묶음이 없습니다.</p>}

      <nav aria-label="검수 페이지" className="mt-5 flex items-center justify-between text-body-sm">
        {page > 1 ? <Link href={url({ page: String(page - 1) })}>이전</Link> : <span className="text-muted">이전</span>}
        <span>{page} / {pages}</span>
        {page < pages ? <Link href={url({ page: String(page + 1) })}>다음</Link> : <span className="text-muted">다음</span>}
      </nav>
    </section>
  );
}
