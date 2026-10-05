import Link from "next/link";
import { redirect } from "next/navigation";
import { summarizeMoodUsage } from "@/lib/admin-mood-usage";
import { AXES as SCREEN_AXES } from "@/lib/mood-axes";
import { loadMoodAdminData } from "@/lib/mood-admin-data";
import { HOW_LABEL, NO_AXIS, selectScreenWords } from "@/lib/mood-screen";
import { normTag, selectAuthorTags } from "@/lib/mood-author-tags";
import { DROP_REASONS, FROM_LABEL, selectPhotoTerms, type PhotoTermDrop, type PhotoTermFrom } from "@/lib/mood-photo-terms";
import { editPhotoTerm } from "./actions";
import { MoodAxisSelect } from "./MoodAxisSelect";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/mood";
const SIZE = 50;
type View = "all" | "authors" | "photo";
type Params = { view?: string; q?: string; axis?: string; page?: string; missing?: string; from?: string; dropped?: string };

/**
 * 무드 어휘 (2026-09-23 정리).
 *  - 1차 전처리 무드: 우리말샘 · 한국어기초사전 · 사진 표현 목록을 합쳐 거른 뒤 무드로 판정한 낱말(docs/40 §17-3). 로컬 파일
 *  - 작가가 쓴 무드 단어: 작가가 사진 · 프로필에 직접 단 태그. 자동 태그(auto_mood_tags)는 뺀다. DB 는 읽기만 한다
 *  - 사진 무드 표현(§17-5): 사진에 실제로 쓸 말의 뼈대 — 에이전트가 사진용으로 모은 표현(사진 표현 목록 · 검증 후보) + 작가 태그.
 *    사전 낱말은 이 뼈대가 같은 말이라고 고를 때만 묶음에 들어온다
 * 예전의 검증 후보 · 확정 무드 · 기존 사진 참고 어휘 · 사전 밖 추가 후보 탭은 1차 전처리에 합쳐 없앴다.
 */
export default async function AdminPhotoMoodPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const view: View = params.view === "authors" ? "authors" : params.view === "photo" ? "photo" : "all";
  const q = (params.q ?? "").trim().slice(0, 100);
  const axisChoices: readonly string[] = [...SCREEN_AXES, NO_AXIS];
  const axis = view !== "authors" && axisChoices.includes(params.axis ?? "") ? params.axis! : "";
  const missing = view === "authors" && params.missing === "1";
  const from = view === "photo" && (params.from ?? "") in FROM_LABEL ? (params.from as PhotoTermFrom) : "";
  const dropped = view === "photo" && params.dropped === "1";
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.page) || 1)));

  // 1차 전처리 목록 · 사진 · 작가 태그 · 사진 무드 표현은 축 · 검색어 화면과 같은 재료다(mood-admin-data.ts)
  const { screen, photos, authorTags, photoTerms } = await loadMoodAdminData();

  // 참고 사진 수는 공개 사진 기준(작가 태그 + 자동 태그) — 예전 화면과 같다
  const usage = summarizeMoodUsage(photos.filter((p) => p.visibility === "published")
    .map((p, i) => ({ id: String(i), mood_tags: p.mood_tags ?? [], auto_mood_tags: p.auto_mood_tags ?? [] })));
  const usageFor = (label: string) => usage.usage.get(normTag(label))?.photos ?? 0;
  const authorMissing = authorTags.filter((t) => !t.inScreen).length;
  const photoMood = photoTerms.filter((r) => !r.drop);
  const dropCounts = Object.fromEntries(DROP_REASONS.map((k) => [k, 0])) as Record<PhotoTermDrop, number>;
  for (const r of photoTerms) if (r.drop) dropCounts[r.drop] += 1;
  const droppedCount = photoTerms.length - photoMood.length;
  const fromCounts = Object.fromEntries((Object.keys(FROM_LABEL) as PhotoTermFrom[]).map((k) => [k, photoMood.filter((r) => r.from.includes(k)).length])) as Record<PhotoTermFrom, number>;

  const screenRows = view === "all" ? selectScreenWords(screen.words, { q, axis }) : [];
  const authorRows = view === "authors" ? selectAuthorTags(authorTags, { q, missing }) : [];
  const photoRows = view === "photo" ? selectPhotoTerms(photoTerms, { q, axis, from, noAxis: NO_AXIS, dropped }) : [];
  const total = view === "all" ? screenRows.length : view === "authors" ? authorRows.length : photoRows.length;
  const pages = Math.max(1, Math.ceil(total / SIZE));
  const url = (changes: Params) => {
    const values = { view, q, axis, missing: missing ? "1" : "", from, dropped: dropped ? "1" : "", page: "1", ...changes };
    return `${BASE}?${new URLSearchParams(Object.entries(values).filter(([, value]) => value))}`;
  };
  if (page > pages) redirect(url({ page: String(pages) }));

  // 갈래마다 제 목록만 보여 준다 — 사진 뼈대와 사전 전체는 유래가 다른 일이다(2026-09-29). 갈래 바꾸기는 둘째 줄 단추로.
  const tabs = view === "photo"
    ? [{ key: "photo", label: "사진 무드 표현", count: photoMood.length }]
    : [
      { key: "all", label: "1차 전처리 무드", count: screen.counts.all },
      { key: "authors", label: "작가가 쓴 무드 단어", count: authorTags.length },
    ];
  return (
    <section aria-labelledby="mood-heading">
      <h2 id="mood-heading" className="text-h2 font-semibold">낱말 고르기 — {view === "photo" ? "사진 뼈대" : "사전 전체"}</h2>
      <p className="mt-1 text-body-sm text-muted">
        {view === "photo"
          ? <>사진에 실제로 쓸 말만 모은 뼈대입니다 — 에이전트가 모은 사진 표현 1,133개와 작가 태그에서 목적 · 관계 · 장소 · 형식 말을 빼고 스냅 · 감성 꼬리를 뗀 것. 여기서 살리고 뺀 것이 위층에 그대로 갑니다.</>
          : <>우리말샘 97만 표제어를 합쳐 거르고(37.9만 → 34.9만) 분류기로 줄 세운 뒤 13.1만을 판정해 남긴 낱말입니다(docs/40 §17-3).</>}
        {" "}DB 에는 쓰지 않았습니다 — 사진 태그는 읽기만 합니다.
      </p>
      {tabs.length > 1 && (
        <nav aria-label="무드 목록" className="my-5 flex flex-wrap gap-2">
          {tabs.map((tab) => <Link key={tab.key} href={url({ view: tab.key, axis: "", missing: "", from: "", dropped: "" })}
            aria-current={view === tab.key ? "page" : undefined}
            className={`rounded-xl border px-4 py-3 text-body-sm ${view === tab.key ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>
            {tab.label} <strong className="ml-2 tabular-nums">{tab.count.toLocaleString("ko-KR")}</strong>
          </Link>)}
        </nav>
      )}
      <form action={BASE} className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="view" value={view} />
        {missing && <input type="hidden" name="missing" value="1" />}
        {from && <input type="hidden" name="from" value={from} />}
        {dropped && <input type="hidden" name="dropped" value="1" />}
        <input key={`q-${q}`} name="q" defaultValue={q} maxLength={100} aria-label="무드 단어 검색" placeholder="무드 단어 검색"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-2" />
        {view !== "authors" && <MoodAxisSelect key={`axis-${axis}`} axis={axis} axes={axisChoices} />}
        {view === "photo" && (Object.keys(FROM_LABEL) as PhotoTermFrom[]).map((k) => (
          <Link key={k} href={url({ from: from === k ? "" : k })} aria-pressed={from === k}
            className={`rounded-xl border px-4 py-2 text-body-sm ${from === k ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>
            {FROM_LABEL[k]} <strong className="ml-1 tabular-nums">{fromCounts[k].toLocaleString("ko-KR")}</strong>
          </Link>
        ))}
        {view === "photo" && (
          <Link href={url({ dropped: dropped ? "" : "1" })} aria-pressed={dropped}
            className={`rounded-xl border px-4 py-2 text-body-sm ${dropped ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>
            뺀 말 보기 <strong className="ml-1 tabular-nums">{droppedCount.toLocaleString("ko-KR")}</strong>
          </Link>
        )}
        {view === "authors" && (
          <Link href={url({ missing: missing ? "" : "1" })} aria-pressed={missing}
            className={`rounded-xl border px-4 py-2 text-body-sm ${missing ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>
            1차 전처리에 없는 것만 <strong className="ml-1 tabular-nums">{authorMissing.toLocaleString("ko-KR")}</strong>
          </Link>
        )}
        <button className="rounded-xl bg-fg px-5 py-2 text-bg">검색</button>
        <Link href={`${BASE}?view=${view}`} className="rounded-xl border border-line px-4 py-2">초기화</Link>
      </form>
      <p className="mb-3 text-caption text-muted">검색 결과 {total.toLocaleString("ko-KR")}개 · {view === "all" ? "이름순" : "사진 많은 순"} · 메뉴 개수는 필터와 관계없는 전체 집계입니다.</p>
      {view === "photo" ? (
        <>
          <p className="mb-3 text-caption text-muted">
            <b className="text-fg">사진에 실제로 쓸 말의 뼈대</b>입니다 — 에이전트가 사진용으로 모은 표현(사진 표현 목록 {fromCounts.generated.toLocaleString("ko-KR")} ·
            검증 후보 {fromCounts.shortlisted.toLocaleString("ko-KR")})과 작가가 사진 · 프로필에 직접 단 태그 {fromCounts.author.toLocaleString("ko-KR")}를 합쳤습니다.
            사전 4.7만 낱말을 따로 거르지 않고, 이 뼈대가 &quot;같은 말&quot; 이라고 고른 사전 낱말만 묶음에 들어옵니다(docs/40 §17-5).
            &quot;스냅&quot; 은 촬영 형식이라, 꼬리의 &quot;감성 · 갬성&quot; 은 X 의 무드라는 뜻일 뿐이라 떼고 앞말만 남겼습니다(야구장스냅 → 야구장, 가을 감성 → 가을, 원래 표기는 옆에 작게 — 떼면 같은 말은 합쳤습니다).
            뺀 말 {droppedCount.toLocaleString("ko-KR")}개는 지우지 않고 &quot;뺀 말 보기&quot; 로 봅니다 —
            <b className="text-fg">목적</b> {dropCounts.목적}(커플 · 우정 · 가족 · 웨딩 · 프로필을 이름으로 부르는 것, 시점 · 두 사람 사이 말) ·
            <b className="text-fg">관계</b> {dropCounts.관계}(축이 관계만인 말 — 케미 · 알콩달콩 · 다정한 시선) ·
            <b className="text-fg">장소</b> {dropCounts.장소}(성수 · 제주 · 한강 · 교토 같은 고유 지명 — 지하철 · 영화관 · 카페 같은 장소 종류와 홍콩 영화 감성 · 유럽풍 같은 양식은 남김) ·
            <b className="text-fg">형식</b> {dropCounts.형식}(상반신 · 호리존 · 인물) · <b className="text-fg">시험</b> {dropCounts.시험}(qwer 같은 시험 입력) ·
            <b className="text-fg">사람</b> {dropCounts.사람}(화면에서 직접 뺀 것). 잘못 빠진 말은 &quot;살리기&quot;, 잘못 남은 말은 &quot;빼기&quot; — 기록은 mood-edits/photo-term-edits.jsonl 에 남고 규칙보다 셉니다.
            관계에 다른 축이 같이 붙은 말(러블리 · 달달한 · 로맨틱한 분위기)은 남겼습니다. 작가 태그만인 말의 축은 1차 전처리에서 물려받았습니다.
          </p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-body-sm">
              <thead className="border-b border-line text-muted"><tr><th className="p-3">사진 무드 표현</th>{dropped && <th className="p-3">뺀 이유</th>}<th className="p-3">축</th><th className="p-3">종류</th><th className="p-3">사진 용례</th><th className="p-3">출처</th><th className="p-3">작가 사진</th><th className="p-3">1차 전처리</th><th className="p-3"></th></tr></thead>
              <tbody>{photoRows.slice((page - 1) * SIZE, page * SIZE).map((row) => <tr key={row.label} className="border-b border-line last:border-0">
                <td className="p-3 font-medium">{row.label}{row.alt?.length ? <span className="ml-2 text-caption font-normal text-muted">{row.alt.join(" · ")}</span> : null}
                  {row.kept && <span className="ml-2 rounded border border-brand/40 px-1.5 text-caption font-normal text-brand">살림</span>}</td>
                {dropped && <td className="p-3">{row.drop}</td>}
                <td className="p-3">{row.axes.join(" · ") || <span className="text-muted">축 없음</span>}</td>
                <td className="p-3 text-muted">{row.kind}</td>
                <td className="p-3 text-muted">{row.usage || "—"}</td>
                <td className="p-3">{row.from.map((k) => FROM_LABEL[k]).join(" · ")}</td>
                <td className="p-3 tabular-nums">{row.photos ? `${row.photos.toLocaleString("ko-KR")}장 · ${row.photographers}명` : "—"}</td>
                <td className="p-3">{row.inScreen ? "있음" : <span className="text-muted">없음</span>}</td>
                <td className="p-3">
                  <form action={editPhotoTerm} className="flex items-center gap-1">
                    <input type="hidden" name="label" value={row.label} />
                    {row.drop
                      ? <>
                        <input name="to" defaultValue={row.label.replace(/\s*(?:감성|갬성)$/u, "")} maxLength={40} aria-label={`${row.label} 를 살릴 이름`}
                          className="w-28 rounded-lg border border-line bg-bg px-2 py-0.5 text-caption" />
                        <button name="action" value="keep" aria-label={`${row.label} 살리기`} className="rounded-lg border border-line px-2 py-0.5 text-caption hover:border-brand hover:text-brand">살리기</button>
                      </>
                      : <button name="action" value="drop" aria-label={`${row.label} 빼기`} className="rounded-lg border border-line px-2 py-0.5 text-caption text-muted hover:border-rose-500 hover:text-rose-700">빼기</button>}
                  </form>
                </td>
              </tr>)}</tbody>
            </table>
            {!total && <p className="p-8 text-center text-muted">표시할 표현이 없습니다.</p>}
          </div>
        </>
      ) : view === "all" ? (
        <>
          <p className="mb-3 text-caption text-muted">
            우리말샘 · 한국어기초사전 · 사진 표현 목록을 합쳐 거른 뒤 <b className="text-fg">무드로 판정한 낱말만</b> 보여줍니다 —
            옛 판정 {(screen.counts.old ?? 0).toLocaleString("ko-KR")} · 새 기준으로 바꾼 것 {(screen.counts.flipped ?? 0).toLocaleString("ko-KR")} ·
            새 판정 {(screen.counts.new ?? 0).toLocaleString("ko-KR")} · 추가 {(screen.counts.added ?? 0).toLocaleString("ko-KR")}
            (검증 후보 · 사전 밖 추가 후보 · 기존 사진 태그 · 홈 탐색 카테고리 중 판정에서 빠졌던 것 — 사진 태그는 목적 · 장소 이름 · 촬영 형식을 버렸다), 그중 판정이 애매했던 것 {screen.counts.unsure.toLocaleString("ko-KR")}.
            띄어쓰기만 다른 표기(파스텔톤)는 낱말 옆에 작게 붙였고, 그 표기로도 찾을 수 있습니다.
            축은 사람이 정한 기존 묶음은 그대로, 나머지는 같은 말 식구로 묶은 뒤 대표의 뜻풀이를 읽고 붙였습니다 —
            축 판정이 애매했던 것 {(screen.counts.axis_unsure ?? 0).toLocaleString("ko-KR")}개는 &quot;축 애매&quot; 로 표시했습니다.
          </p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-body-sm">
              <thead className="border-b border-line text-muted"><tr><th className="p-3">무드 표현</th><th className="p-3">축</th><th className="p-3">판정 근거</th><th className="p-3">상태</th><th className="p-3">참고 사진</th></tr></thead>
              <tbody>{screenRows.slice((page - 1) * SIZE, page * SIZE).map((row) => <tr key={row.w} className="border-b border-line last:border-0">
                <td className="p-3 font-medium">{row.w}{row.alt?.length ? <span className="ml-2 text-caption font-normal text-muted">{row.alt.join(" · ")}</span> : null}</td>
                <td className="p-3">{row.axes.join(" · ") || <span className="text-muted">축 없음</span>}{row.axis_unsure && <span className="ml-1 rounded border border-line px-1.5 text-caption text-muted">축 애매</span>}</td>
                <td className="p-3 text-muted">{row.why}</td>
                <td className="p-3">{HOW_LABEL[row.how]}{row.src?.length ? <span className="ml-1 text-caption text-muted">({row.src.join(" · ")})</span> : null}{!row.sure && <span className="ml-1 rounded border border-line px-1.5 text-caption text-muted">애매</span>}</td>
                <td className="p-3">{usageFor(row.w)}장</td>
              </tr>)}</tbody>
            </table>
            {!total && <p className="p-8 text-center text-muted">표시할 무드가 없습니다.</p>}
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-caption text-muted">
            작가가 포트폴리오를 올릴 때 사진에 단 태그와 작가 프로필에 적은 무드 태그입니다(보관한 사진만 뺍니다).
            자동으로 붙은 태그는 넣지 않았습니다. 목적 · 장소 말(웨딩스냅 · 경복궁)도 작가가 쓴 그대로 둡니다.
          </p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-body-sm">
              <thead className="border-b border-line text-muted"><tr><th className="p-3">무드 단어</th><th className="p-3">사진</th><th className="p-3">쓴 작가</th><th className="p-3">프로필에 쓴 작가</th><th className="p-3">1차 전처리</th></tr></thead>
              <tbody>{authorRows.slice((page - 1) * SIZE, page * SIZE).map((row) => <tr key={row.label} className="border-b border-line last:border-0">
                <td className="p-3 font-medium">{row.label}</td>
                <td className="p-3 tabular-nums">{row.photos.toLocaleString("ko-KR")}장</td>
                <td className="p-3 tabular-nums">{row.photographers}명</td>
                <td className="p-3 tabular-nums">{row.profiles ? `${row.profiles}명` : "—"}</td>
                <td className="p-3">{row.inScreen ? "있음" : <span className="text-muted">없음</span>}</td>
              </tr>)}</tbody>
            </table>
            {!total && <p className="p-8 text-center text-muted">표시할 단어가 없습니다.</p>}
          </div>
        </>
      )}
      <nav aria-label="무드 페이지" className="mt-4 flex items-center justify-between text-body-sm">
        {page > 1 ? <Link href={url({ page: String(page - 1) })}>이전</Link> : <span className="text-muted">이전</span>}
        <span>{page} / {pages}</span>
        {page < pages ? <Link href={url({ page: String(page + 1) })}>다음</Link> : <span className="text-muted">다음</span>}
      </nav>
    </section>
  );
}
