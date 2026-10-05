import Link from "next/link";
import { bigMoodNames } from "@/lib/mood-photo-families";
import {
  loadBandConfirms, loadFamilyModel, loadFamilyReviews, loadNewConfirms, loadPhotoMoodLayers, loadPhotoMoodNames, loadPhotoMoodTagEdits, loadPhotoMoodTags,
} from "@/lib/mood-photo-layers-data";
import { latestNewConfirms, proposalCut, proposedFamilies } from "@/lib/mood-new-photos";
import { addedTags, droppedTags, familyCut, latestConfirms, latestReviews, tagId } from "@/lib/mood-photo-tags";
import { confirmNewPhoto, fetchNewPhotos, undoNewPhoto } from "../actions";
import { AddTag } from "../AddTag";
import { loadThumbs, PhotoThumb, TagButton } from "../parts";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/tags/new";
const PAGE = 20;
type Params = { p?: string; got?: string; err?: string; show?: string };

/**
 * 신규 사진 검수(docs/47 §6, 사람 요청 2026-10-05) — 새로 올라온 사진은 무드 태그를 다시 매겨야 한다.
 *
 * [새 사진 불러오기] → 공개 · 임베딩이 있는데 아직 점수가 없는 사진을 **굳힌 기준**(photo-family-model.json)으로 매긴다.
 * 가족 판정(구간 검수)은 이미 끝났으므로 사진 한 장씩 훑고 **빼기만** 한 뒤 [확정] — 남은 가족이 그 사진의 태그가 되고 검색 색인에 바로 들어간다.
 * 제안 기준은 가족마다 "검수에서 가장 낮게 확정한 구간" 이상(그 아래는 사람이 다 뺀 구간이다). 「문장 고칠 것」 가족은 제안하지 않는다.
 * DB 에는 쓰지 않는다 — 기록은 mood-edits/photo-mood-tags-new.json · photo-mood-new-confirmed.jsonl.
 */
export default async function NewPhotoTagsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [layers, tags, edits, reviewRows, confirmRows, newRows, moodNames, model] = await Promise.all([
    loadPhotoMoodLayers(), loadPhotoMoodTags(), loadPhotoMoodTagEdits(), loadFamilyReviews(), loadBandConfirms(), loadNewConfirms(), loadPhotoMoodNames(), loadFamilyModel(),
  ]);
  const head = <h2 id="new-photo-heading" className="text-h2 font-semibold">신규 사진 — 무드 태그 검수</h2>;
  if (!layers || !tags) {
    return <section aria-labelledby="new-photo-heading">{head}<p className="mt-6 rounded-xl border border-line p-8 text-center text-muted">아직 태그를 만들지 않았습니다.</p></section>;
  }

  const reviews = latestReviews(reviewRows);
  const confirms = latestConfirms(confirmRows);
  const dropped = droppedTags(edits);
  const handAdded = addedTags(edits);              // 사람이 [+ 태그 추가] 로 직접 붙인 가족
  const done = latestNewConfirms(newRows);
  const famName = new Map(layers.families.map((f) => [f.key, f.name]));
  const famBig = new Map(layers.families.map((f) => [f.key, f.big]));
  const bigName = bigMoodNames(layers, moodNames);
  const cutOf = (key: string) => proposalCut(familyCut(key, reviews, tags.z_cut, tags.z_floor), confirms.get(key)?.keys());
  const off = (key: string) => reviews.get(key)?.status === "rewrite";
  const addOptions = layers.families.map((f) => ({ key: f.key, name: famName.get(f.key) ?? f.key, big: bigName.get(f.big) ?? "보류", words: f.bundles }));

  const added = Object.entries(tags.added ?? {}).sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0])).map(([id]) => id);
  const pending = added.filter((id) => !done.has(id));
  const confirmed = added.filter((id) => done.has(id));
  const showDone = params.show === "done";
  const list = showDone ? confirmed : pending;
  const page = Math.max(0, Number(params.p ?? 0) || 0);
  const shown = list.slice(page * PAGE, (page + 1) * PAGE);
  const thumbs = await loadThumbs(shown);
  const pages = Math.ceil(list.length / PAGE);
  const modelOk = model && model.prompts_hash === tags.prompts_hash;

  return (
    <section aria-labelledby="new-photo-heading">
      {head}
      <p className="mt-1 text-body-sm text-muted">
        새로 올라온 사진을 지금 검수한 사진들과 <b className="text-fg">같은 문장 · 같은 통계</b>로 매깁니다(기존 사진 점수는 그대로).
        가족 판정은 끝났으니 사진마다 틀린 가족만 <b className="text-fg">빼고 [확정]</b> — 남은 가족이 태그가 되고 검색에 바로 들어갑니다.
        제안 기준은 가족마다 검수에서 가장 낮게 확정한 구간 이상입니다. DB 에는 아직 쓰지 않습니다.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
        <form action={fetchNewPhotos}>
          <button disabled={!modelOk} className="rounded-xl border-2 border-brand px-4 py-2 text-body-sm font-medium text-brand disabled:opacity-40">새 사진 불러오기</button>
        </form>
        <span className="text-caption text-muted">
          공개 · 임베딩이 있는데 아직 점수가 없는 사진을 한 번에 300장까지 매깁니다(맥미니 06:00 배치가 임베딩을 만든 뒤).
          {model && <> 기준 {model.made_at.slice(0, 10)} · 문장 지문 {model.prompts_hash}</>}
        </span>
        {params.got && <span className="rounded-lg bg-success-soft px-2 py-1 text-caption text-success-ink">새 사진 {params.got}장을 매겼습니다</span>}
        {(params.err === "hash" || (model && !modelOk)) && (
          <span className="rounded-lg bg-warning-soft px-2 py-1 text-caption text-warning-ink">
            가족 문장이 기준과 달라 매길 수 없습니다 — 문장을 고쳤으면 <code>tag_photo_moods.py</code> → <code>export_family_model.py</code> 를 다시 돌려야 합니다
          </span>
        )}
        {(params.err === "nomodel" || !model) && (
          <span className="rounded-lg bg-warning-soft px-2 py-1 text-caption text-warning-ink">기준 파일이 없습니다 — <code>py export_family_model.py</code></span>
        )}
      </div>

      <nav aria-label="보기" className="mt-4 flex flex-wrap gap-2">
        <Link href={BASE} aria-current={!showDone ? "page" : undefined}
          className={`rounded-xl border px-3.5 py-2 text-body-sm ${!showDone ? "border-brand bg-brand/10 font-semibold text-brand" : "border-line text-muted hover:text-fg"}`}>검수 대기 ({pending.length})</Link>
        <Link href={`${BASE}?show=done`} aria-current={showDone ? "page" : undefined}
          className={`rounded-xl border px-3.5 py-2 text-body-sm ${showDone ? "border-brand bg-brand/10 font-semibold text-brand" : "border-line text-muted hover:text-fg"}`}>확정 ({confirmed.length})</Link>
      </nav>

      {list.length === 0 && (
        <p className="mt-6 rounded-xl border border-line p-8 text-center text-muted">
          {showDone ? "아직 확정한 신규 사진이 없습니다." : "검수할 신규 사진이 없습니다 — [새 사진 불러오기] 로 새로 올라온 사진을 매깁니다."}
        </p>
      )}

      <ul className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
        {shown.map((photo) => {
          const row = tags.photos[photo];
          // 제안 + 사람이 직접 붙인 가족(제안에 없던 것)
          const suggested = proposedFamilies(photo, row, cutOf, off, dropped);
          const proposed = [
            ...suggested,
            ...layers.families.filter((f) => handAdded.has(tagId(photo, "family", f.key)) && !dropped.has(tagId(photo, "family", f.key)) && !suggested.some((s) => s.key === f.key))
              .map((f) => ({ key: f.key, z: NaN, byTag: false, dropped: false })),
          ];
          const kept = done.get(photo);
          return (
            <li key={photo} className="flex gap-3 rounded-xl border border-line p-2">
              <div className="w-56 shrink-0"><PhotoThumb id={photo} url={thumbs.get(photo)} /></div>
              <div className="min-w-0 flex-1 text-caption">
                <p className="text-muted tabular-nums">{tags.added?.[photo]?.slice(0, 10)} 매김</p>
                {kept ? (
                  <>
                    <p className="mt-1 font-medium">확정한 가족 {kept.length}</p>
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {kept.map((k) => <li key={k} className="rounded-lg border border-line px-1.5 py-0.5">{famName.get(k) ?? k} <span className="text-muted">{bigName.get(famBig.get(k) ?? "") ?? "보류"}</span></li>)}
                      {!kept.length && <li className="text-muted">태그 없음으로 확정</li>}
                    </ul>
                    <form action={undoNewPhoto} className="mt-2">
                      <input type="hidden" name="photo" value={photo} />
                      <button className="rounded-lg border border-line px-2.5 py-1 text-muted hover:text-fg">되돌리기</button>
                    </form>
                  </>
                ) : (
                  <>
                    <p className="mt-1 font-medium">제안 가족 {proposed.filter((f) => !f.dropped).length}{proposed.some((f) => f.dropped) && <span className="text-muted"> (뺀 것 {proposed.filter((f) => f.dropped).length})</span>}</p>
                    <ul className="mt-1.5 space-y-1">
                      {proposed.map((f) => (
                        <li key={f.key} className={`flex items-center gap-1.5 ${f.dropped ? "opacity-50" : ""}`}>
                          <span className={`font-medium ${f.dropped ? "line-through" : ""}`}>{famName.get(f.key) ?? f.key}</span>
                          <span className="text-muted">{bigName.get(famBig.get(f.key) ?? "") ?? "보류"}</span>
                          {Number.isNaN(f.z) ? <span className="rounded border border-brand/40 px-1 text-brand">직접</span> : <span className="tabular-nums text-muted">{f.z.toFixed(1)}</span>}
                          {f.byTag && <span className="rounded border border-line px-1 text-muted">태그</span>}
                          <TagButton photo={photo} layer="family" k={f.key} dropped={f.dropped} />
                        </li>
                      ))}
                      {!proposed.length && (
                        <li className="text-muted">
                          제안 없음{row.near?.length ? ` — 가까웠던 가족: ${row.near.map(([k, z]) => `${famName.get(k) ?? k} ${z.toFixed(1)}`).join(" · ")}` : ""}
                        </li>
                      )}
                    </ul>
                    <div className="mt-2"><AddTag photo={photo} options={addOptions} have={proposed.filter((f) => !f.dropped).map((f) => f.key)} /></div>
                    <form action={confirmNewPhoto} className="mt-2">
                      <input type="hidden" name="photo" value={photo} />
                      <button className="rounded-lg border-2 border-brand px-3 py-1 font-medium text-brand">
                        {proposed.some((f) => !f.dropped) ? "확정" : "태그 없이 확정"}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {pages > 1 && (
        <nav aria-label="쪽" className="mt-4 flex flex-wrap items-center gap-1.5 text-caption">
          {page > 0 && <Link href={`${BASE}?${new URLSearchParams({ ...(showDone ? { show: "done" } : {}), p: String(page - 1) })}`} className="rounded-lg border border-line px-2.5 py-1 text-muted">← 이전</Link>}
          <span className="tabular-nums text-muted">{page + 1} / {pages}</span>
          {page < pages - 1 && <Link href={`${BASE}?${new URLSearchParams({ ...(showDone ? { show: "done" } : {}), p: String(page + 1) })}`} className="rounded-lg border border-line px-2.5 py-1 text-muted">다음 →</Link>}
        </nav>
      )}
    </section>
  );
}
