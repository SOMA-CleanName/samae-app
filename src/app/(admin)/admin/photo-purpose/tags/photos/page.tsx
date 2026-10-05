import Link from "next/link";
import { bigMoodNames } from "@/lib/mood-photo-families";
import { loadFamilyReviews, loadPhotoMoodLayers, loadPhotoMoodNames, loadPhotoMoodTagEdits, loadPhotoMoodTags } from "@/lib/mood-photo-layers-data";
import { addedTags, applyReview, droppedTags, latestReviews, listTaggedPhotos, tagId, type PhotoSort } from "@/lib/mood-photo-tags";
import { createAdminClient } from "@/lib/supabase/admin";
import { AddTag } from "../AddTag";
import { loadThumbs, PhotoThumb, TagButton } from "../parts";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/tags/photos";
const PAGE = 24;
type Params = { sort?: string; big?: string; p?: string; seed?: string };

/**
 * 사진별 태그 — 사진 한 장에 어떤 큰 무드 · 가족이 붙었는지 구경한다(사람 요청 2026-10-01, docs/47 §5).
 * 태그마다 [빼기] — 태그 관리 화면과 같은 기록(photo-mood-tag-edits.jsonl)에 남는다. DB 에는 아직 쓰지 않는다.
 * [+ 태그 추가] — 가족을 찾아 직접 붙인다(사람 요청 2026-10-05, 같은 기록 action add). 「직접」 표시, 검색 색인에 바로 들어간다.
 */
export default async function PhotoTagBrowsePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [layers, tags, edits, reviewRows, moodNames] = await Promise.all([loadPhotoMoodLayers(), loadPhotoMoodTags(), loadPhotoMoodTagEdits(), loadFamilyReviews(), loadPhotoMoodNames()]);
  if (!layers || !tags) {
    return <p className="rounded-xl border border-line p-8 text-center text-muted">아직 태그를 만들지 않았습니다 — <code className="text-fg">py tag_photo_moods.py</code></p>;
  }

  const latest = params.sort === "latest";                       // 최신 사진 순(사람 요청 2026-10-05) — 올린 시각으로 다시 줄 세운다
  const sort: PhotoSort | "latest" = latest ? "latest" : params.sort === "few" ? "few" : params.sort === "random" ? "random" : "many";
  const big = layers.moods.some((m) => m.key === params.big) ? params.big! : "";
  const seed = Number(params.seed ?? 1) || 1;
  const page = Math.max(0, Number(params.p ?? 0) || 0);
  const dropped = droppedTags(edits);
  const added = addedTags(edits);                                 // 사람이 [+ 태그 추가] 로 직접 붙인 가족
  // 가족 검수(기준 올림 · 뺀 것 · 직접 붙인 것)를 반영한 태그 — 큰 무드는 남은 가족에서 다시 물려받는다
  const live = applyReview(tags, new Map(layers.families.map((f) => [f.key, f.big])), { dropped, reviews: latestReviews(reviewRows), added });
  const listed = listTaggedPhotos(live, new Set(), { sort: sort === "latest" ? "many" : sort, big: big || undefined, seed });
  const all = latest ? await byNewest(listed) : listed;
  const shown = all.slice(page * PAGE, (page + 1) * PAGE);
  const thumbs = await loadThumbs(shown);

  const famName = new Map(layers.families.map((f) => [f.key, f.name]));
  const bigName = bigMoodNames(layers, moodNames);
  const famBig = new Map(layers.families.map((f) => [f.key, f.big]));
  const addOptions = layers.families.map((f) => ({ key: f.key, name: famName.get(f.key) ?? f.key, big: bigName.get(f.big) ?? "보류", words: f.bundles }));
  const url = (changes: Params) => `${BASE}?${new URLSearchParams(Object.entries({ sort, big, seed: sort === "random" ? String(seed) : "", ...changes }).filter(([, v]) => v))}`;
  const pages = Math.ceil(all.length / PAGE);

  return (
    <section aria-labelledby="photo-tag-browse-heading">
      <h2 id="photo-tag-browse-heading" className="text-h2 font-semibold">사진별 태그</h2>
      <p className="mt-1 text-body-sm text-muted">
        사진 한 장에 붙은 큰 무드 · 가족을 봅니다. 숫자는 점수(z, 기준 {tags.z_cut} 이상) · <b className="text-fg">태그</b> 는 작가가 단 태그로 붙은 것.
        틀린 태그는 [빼기] — 태그 관리와 같은 기록에 남습니다(DB 에는 아직 쓰지 않음).
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {([["latest", "최신 사진 순"], ["many", "태그 많은 순"], ["few", "태그 적은 순"], ["random", "무작위"]] as const).map(([v, label]) => (
          <Link key={v} href={url({ sort: v, p: "" })} aria-current={sort === v ? "true" : undefined}
            className={`rounded-lg border px-2.5 py-1 text-caption ${sort === v ? "border-brand bg-brand/10 text-brand" : "border-line text-muted hover:text-fg"}`}>{label}</Link>
        ))}
        {sort === "random" && <Link href={url({ seed: String(seed + 1), p: "" })} className="text-caption text-muted underline underline-offset-2">다시 섞기</Link>}
        <span className="ml-auto text-caption text-muted tabular-nums">{all.length.toLocaleString("ko-KR")}장{big && ` · 큰 무드 ${bigName.get(big)}`}</span>
      </div>

      <nav aria-label="큰 무드로 거르기" className="mt-2 flex flex-wrap gap-1.5">
        <Link href={url({ big: "", p: "" })} aria-current={!big ? "true" : undefined}
          className={`rounded-lg border px-2.5 py-1 text-caption ${!big ? "border-fg text-fg" : "border-line text-muted hover:text-fg"}`}>전체</Link>
        {layers.moods.map((m) => (
          <Link key={m.key} href={url({ big: m.key, p: "" })} aria-current={big === m.key ? "true" : undefined}
            className={`rounded-lg border px-2.5 py-1 text-caption ${big === m.key ? "border-fg text-fg" : "border-line text-muted hover:text-fg"}`}>{bigName.get(m.key)}</Link>
        ))}
      </nav>

      <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {shown.map((photo) => {
          const row = tags.photos[photo];
          const now = live.photos[photo];
          const kept = new Set(now.families.map(([k]) => k));
          // 점수로 붙은 가족 + 사람이 직접 붙인 가족(점수가 없던 것은 z 없이)
          const listed: [string, number | null, boolean][] = [
            ...row.families,
            ...now.families.filter(([k]) => !row.families.some(([f]) => f === k)).map(([k]): [string, number | null, boolean] => [k, null, false]),
          ];
          return (
            <li key={photo} className="flex gap-3 rounded-xl border border-line p-2">
              <div className="w-48 shrink-0"><PhotoThumb id={photo} url={thumbs.get(photo)} /></div>
              <div className="min-w-0 flex-1 text-caption">
                <p className="font-medium">가족 {now.families.length}{listed.length > now.families.length && ` (빠진 것 ${listed.length - now.families.length})`} · 큰 무드 {now.moods.length}</p>
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {now.moods.map(([k, z]) => (
                    <li key={k} className="rounded-lg border border-fg/30 px-1.5 py-0.5 font-medium">
                      {bigName.get(k) ?? k} <span className="tabular-nums text-muted">{z.toFixed(1)}</span>
                    </li>
                  ))}
                  {!now.moods.length && <li className="text-muted">태그 없음{row.near?.length ? ` — 가까웠던 가족: ${row.near.map(([k, z]) => `${famName.get(k)} ${z.toFixed(1)}`).join(" · ")}` : ""}</li>}
                </ul>
                <ul className="mt-1.5 space-y-1">
                  {listed.map(([k, z, byTag]) => {
                    const off = !kept.has(k);                // 뺐거나 가족 기준을 올려 빠졌다
                    const byHand = dropped.has(tagId(photo, "family", k));
                    const mine = added.has(tagId(photo, "family", k));
                    return (
                      <li key={k} className={`flex items-center gap-1.5 ${off ? "opacity-40" : ""}`}>
                        <span className={off ? "line-through" : ""}>{famName.get(k) ?? k}</span>
                        <span className="text-muted">{bigName.get(famBig.get(k) ?? "") ?? "보류"}</span>
                        {z !== null && <span className="tabular-nums text-muted">{z.toFixed(1)}</span>}
                        {byTag && <span className="rounded border border-line px-1 text-muted">태그</span>}
                        {mine && <span className="rounded border border-brand/40 px-1 text-brand">직접</span>}
                        {off && !byHand ? <span className="text-muted">기준 아래</span> : <TagButton photo={photo} layer="family" k={k} dropped={byHand} />}
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-2">
                  <AddTag photo={photo} options={addOptions} have={[...kept]} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {pages > 1 && (
        <nav aria-label="쪽" className="mt-4 flex flex-wrap items-center gap-1.5 text-caption">
          {page > 0 && <Link href={url({ p: String(page - 1) })} className="rounded-lg border border-line px-2.5 py-1 text-muted">← 이전</Link>}
          <span className="tabular-nums text-muted">{page + 1} / {pages}</span>
          {page < pages - 1 && <Link href={url({ p: String(page + 1) })} className="rounded-lg border border-line px-2.5 py-1 text-muted">다음 →</Link>}
        </nav>
      )}
    </section>
  );
}

/** 사진을 올린 시각(created_at) 최신 순으로 — DB 에서 시각만 읽는다(1,000장씩). 시각을 못 읽은 사진은 뒤로 */
async function byNewest(ids: string[]): Promise<string[]> {
  const at = new Map<string, string>();
  const admin = createAdminClient();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("photos").select("id, created_at").in("id", ids.slice(i, i + 200));
    for (const row of data ?? []) at.set(row.id as string, row.created_at as string);
  }
  return [...ids].sort((a, b) => (at.get(b) ?? "").localeCompare(at.get(a) ?? "") || a.localeCompare(b));
}
