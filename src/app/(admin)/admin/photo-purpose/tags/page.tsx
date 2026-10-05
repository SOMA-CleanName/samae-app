import Link from "next/link";
import { bigMoodNames, clustersIn, noteFor } from "@/lib/mood-photo-families";
import { latestNewConfirms, newConfirmedByFamily } from "@/lib/mood-new-photos";
import {
  loadBandConfirms, loadFamilyReviews, loadNewConfirms, loadPhotoFamilyNotes, loadPhotoClusters, loadPhotoMoodLayers, loadPhotoMoodNames, loadPhotoMoodTagEdits, loadPhotoMoodTags,
} from "@/lib/mood-photo-layers-data";
import {
  addedTags, applyReview, bandTop, BANDS, confirmedPhotos, droppedTags, inBand, latestConfirms, latestReviews, nextBand, photosWithTag, tagCounts,
  untaggedPhotos, type FamilyReviewStatus, type TaggedPhotoRow,
} from "@/lib/mood-photo-tags";
import { confirmBand, dropBand, reviewFamily, undoBand } from "./actions";
import { nameBigMood } from "../mood/families/photo/actions";
import { ChipSearch } from "./ChipSearch";
import { DropThumb, loadThumbs, PhotoThumb, TagButton } from "./parts";

export const dynamic = "force-dynamic";
const BASE = "/admin/photo-purpose/tags";
const PAGE = 60;
type Params = { view?: string; key?: string; p?: string; band?: string; show?: string };

const STATUS: Record<FamilyReviewStatus, { label: string; chip: string }> = {
  pass: { label: "검수 끝", chip: "border-success bg-success-soft text-success-ink" },
  rewrite: { label: "문장 고칠 것", chip: "border-warning bg-warning-soft text-warning-ink" },
  todo: { label: "검수 중", chip: "border-line" },
};
const bandLabel = (b: number) => (bandTop(b) === Infinity ? `${b.toFixed(2)} 이상` : `${b.toFixed(2)} ~ ${bandTop(b).toFixed(2)}`);

/**
 * 태그 관리 — 가족 단위 · **단계별 소거법**(docs/47 §5, 사람 결정 2026-10-01). 큰 무드는 가족에서 물려받으므로 가족만 본다.
 * 유사도가 높을수록 맞을 확률이 높다 — 가족마다 점수 구간을 위에서부터(3.0 이상 → 2.75 → … → 1.0) 하나씩 보고,
 * 틀린 사진을 한 장씩 뺀 뒤 [이 구간 통과] → 남은 사진이 그 가족 태그로 확정된다(photo-mood-tag-confirmed.jsonl). 다음 구간으로 넘어간다.
 * 보기: 가족 검수(기본) · 확정된 태그(view=confirmed) · 큰 무드별(view=big) · 태그 없는 사진(view=empty). **DB 에는 아직 쓰지 않는다.**
 */
export default async function PhotoMoodTagsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const view: "family" | "confirmed" | "big" | "empty" =
    params.view === "big" ? "big" : params.view === "empty" ? "empty" : params.view === "confirmed" ? "confirmed" : "family";
  const [layers, raw, edits, notes, reviewRows, confirmRows, moodNames, clusterData, newConfirmRows] = await Promise.all([
    loadPhotoMoodLayers(), loadPhotoMoodTags(), loadPhotoMoodTagEdits(), loadPhotoFamilyNotes(), loadFamilyReviews(), loadBandConfirms(), loadPhotoMoodNames(), loadPhotoClusters(), loadNewConfirms(),
  ]);

  const head = <h2 id="photo-tags-heading" className="text-h2 font-semibold">태그 관리 — 단계별 검수</h2>;
  if (!layers || !raw) {
    return (
      <section aria-labelledby="photo-tags-heading">
        {head}
        <p className="mt-6 rounded-xl border border-line p-8 text-center text-muted">
          아직 태그를 만들지 않았습니다 — <code className="text-fg">py tag_photo_moods.py</code> 를 돌리면 사진마다 가족 · 큰 무드가 붙습니다.
        </p>
      </section>
    );
  }

  const dropped = droppedTags(edits);
  const reviews = latestReviews(reviewRows);
  const confirms = latestConfirms(confirmRows);
  const bigOf = new Map(layers.families.map((f) => [f.key, f.big]));
  const live = applyReview(raw, bigOf, { dropped, reviews, added: addedTags(edits) });   // 사람이 직접 붙인 가족도
  const famName = new Map(layers.families.map((f) => [f.key, f.name]));
  const bigName = bigMoodNames(layers, moodNames);
  const counts = { family: tagCounts(live, "family", new Set()), big: tagCounts(live, "big", new Set()) };
  const untagged = untaggedPhotos(live);

  // 가족 순서 — 번호 순(F01 → F97). 무드 › D4 가족 화면과 같은 순서라 나란히 놓고 비교하며 검수한다(사람 요청 2026-10-01)
  const order = [...layers.families].sort((a, b) => a.key.localeCompare(b.key));
  const statusOf = (key: string): FamilyReviewStatus => reviews.get(key)?.status ?? "todo";
  // 신규 사진(굳힌 기준으로 나중에 매긴 것)은 구간 검수에서 빼고 「신규 사진」 에서 본다 — 확정한 것은 여기 확정 수에 합친다
  const added = new Set(Object.keys(raw.added ?? {}));
  const freshConfirmed = newConfirmedByFamily(latestNewConfirms(newConfirmRows), dropped);
  const confirmedOf = (key: string) => [...confirmedPhotos(key, confirms, dropped), ...(freshConfirmed.get(key) ?? [])];
  const totalConfirmed = order.reduce((n, f) => n + confirmedOf(f.key).length, 0);
  const passedBands = order.reduce((n, f) => n + (confirms.get(f.key)?.size ?? 0), 0);

  const keys = view === "big" ? layers.moods.map((m) => m.key) : order.map((f) => f.key);
  const key = params.key && keys.includes(params.key) ? params.key : view === "family" ? (order.find((f) => statusOf(f.key) === "todo")?.key ?? "") : "";
  const page = Math.max(0, Number(params.p ?? 0) || 0);

  const family = view === "family" || view === "confirmed" ? layers.families.find((f) => f.key === key) : undefined;
  const rows: TaggedPhotoRow[] = family ? photosWithTag(raw, "family", family.key, dropped).filter((r) => !added.has(r.photo)) : view === "big" && key ? photosWithTag(live, "big", key, dropped) : [];
  // 가족 화면에서 볼 것 — show=done 확정된 사진 · show=all 전체 · 아니면 구간(기본: 아직 통과 안 한 가장 높은 구간)
  const show = params.show === "done" || view === "confirmed" ? "done" : params.show === "all" ? "all" : "band";
  // 이미 확정한 사진은 구간 검수에서 뺀다(사람 결정 2026-10-02) — 문장을 고쳐 다시 계산하면 점수가 바뀌어 다른 구간으로 옮겨 가는데, 다시 볼 필요가 없다
  const doneIds = family ? confirmedOf(family.key) : [];
  const doneSet = new Set(doneIds);
  const open = rows.filter((r) => !doneSet.has(r.photo));
  const passedHere = family ? confirms.get(family.key) : undefined;
  const band = family && show === "band"
    ? (BANDS.find((b) => String(b) === params.band) ?? nextBand(open) ?? BANDS[0])
    : null;
  // 구간에서 볼 것 — 아직 확정 안 된 사진(뺀 것도 되살릴 수 있게 보인다). 남은 게 없고 통과한 구간이면 그때 확정한 사진을 참고로
  const byId = new Map(rows.map((r) => [r.photo, r]));
  const asRow = (photo: string): TaggedPhotoRow => byId.get(photo) ?? { photo, z: Number.NaN, byTag: false, dropped: false };
  const openHere = band === null ? [] : inBand(open, band);
  const showingDone = band !== null && !openHere.length && !!passedHere?.has(band);
  const bandRows = showingDone ? passedHere!.get(band!)!.filter((p) => doneSet.has(p)).map(asRow) : openHere;
  const confirmedSet = new Set(family ? confirms.get(family.key)?.get(band ?? -1) ?? [] : []);
  const shown = show === "all" || view === "big" ? rows.slice(page * PAGE, (page + 1) * PAGE) : [];
  const doneShown = show === "done" ? doneIds.slice(page * PAGE, (page + 1) * PAGE) : [];
  const thumbs = await loadThumbs([...new Set([...bandRows.map((r) => r.photo), ...shown.map((r) => r.photo), ...doneShown,
    ...(view === "empty" ? untagged.map((r) => r.photo) : [])])]);
  const famUrl = (k: string, extra: Record<string, string> = {}) => `${BASE}?${new URLSearchParams({ key: k, ...extra })}`;

  return (
    <section aria-labelledby="photo-tags-heading">
      {head}
      <p className="mt-1 text-body-sm text-muted">
        사진 {Object.keys(raw.photos).length.toLocaleString("ko-KR")}장 · 기준 z ≥ {raw.z_cut}(최대한 넓게) · {raw.made_at.slice(0, 16).replace("T", " ")} 계산 ·
        가족마다 점수 구간을 위에서부터 하나씩 보고, 틀린 사진을 뺀 뒤 [이 구간 통과] → 남은 사진이 확정됩니다.
      </p>
      <p className="mt-1 text-body-sm">
        <b>확정된 태그 {totalConfirmed.toLocaleString("ko-KR")}건</b>
        <span className="text-muted"> — 통과한 구간 {passedBands} · 검수 끝 가족 {order.filter((f) => statusOf(f.key) === "pass").length}/{order.length} ·
          문장 고칠 것 {order.filter((f) => statusOf(f.key) === "rewrite").length} · 뺀 사진 {dropped.size}건. DB 에는 아직 쓰지 않았습니다.</span>
      </p>

      <nav aria-label="보기" className="mt-4 flex flex-wrap gap-2">
        {[
          { v: "family", label: `가족 검수 (${order.length})` },
          { v: "confirmed", label: `확정된 태그 (${totalConfirmed.toLocaleString("ko-KR")})` },
          { v: "big", label: `큰 무드별 (${layers.moods.length})` },
          { v: "empty", label: `태그 없는 사진 (${untagged.length})` },
        ].map((t) => (
          <Link key={t.v} href={t.v === "family" ? BASE : `${BASE}?view=${t.v}`} aria-current={view === t.v ? "page" : undefined}
            className={`rounded-xl border px-3.5 py-2 text-body-sm ${view === t.v ? "border-brand bg-brand/10 font-semibold text-brand" : "border-line text-muted hover:text-fg"}`}>{t.label}</Link>
        ))}
      </nav>

      {view !== "empty" && (
        <ChipSearch>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {keys.map((k) => {
            const done = view === "big" ? 0 : confirmedOf(k).length;
            const fam = view === "big" ? null : layers.families.find((f) => f.key === k);
            const search = view === "big"
              ? [k, bigName.get(k), ...order.filter((f) => f.big === k).flatMap((f) => [f.name, ...f.bundles])].join(" ")
              : [k, fam?.name, bigName.get(fam?.big ?? ""), ...(fam?.bundles ?? [])].join(" ");
            return (
              <li key={k} data-search={search}>
                <Link href={view === "big" ? `${BASE}?view=big&key=${k}` : view === "confirmed" ? `${BASE}?view=confirmed&key=${k}` : famUrl(k)}
                  aria-current={key === k ? "true" : undefined}
                  className={`flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1 text-caption ${view === "big" ? "border-line" : STATUS[statusOf(k)].chip} ${key === k ? "ring-2 ring-brand" : ""}`}>
                  {view !== "big" && <span className="tabular-nums opacity-60">{k.toUpperCase()}</span>}
                  <b className="font-medium">{view === "big" ? bigName.get(k) : famName.get(k)}</b>
                  <span className="tabular-nums opacity-70">{view === "big" ? counts.big.get(k) ?? 0 : done ? `확정 ${done}` : counts.family.get(k) ?? 0}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        </ChipSearch>
      )}

      {(view === "family" || view === "confirmed") && family && (() => {
        const status = statusOf(family.key);
        const note = noteFor({ members: family.bundles }, notes.families)?.note;
        const passed = confirms.get(family.key);
        return (
          <div className="mt-5">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong className="text-h3 font-semibold">{family.name}</strong>
              <span className="text-caption text-muted">{family.key.toUpperCase()} · 큰 무드 {bigName.get(family.big) ?? "보류"}</span>
              <span className={`rounded-lg border px-2 py-0.5 text-caption ${STATUS[status].chip}`}>{STATUS[status].label}</span>
              <span className="ml-auto text-caption text-muted tabular-nums">확정 {doneIds.length}장 · 후보 {rows.length}장</span>
            </div>
            {note && <p className="mt-1 text-body-sm text-muted">{note}</p>}
            <p className="mt-1 text-caption text-muted">
              식구 묶음: {family.bundles.join(" · ")} · 영어 문장은 <Link href="/admin/photo-purpose/mood/families/photo" className="underline underline-offset-2">무드 › D4 가족</Link> 에서 고칩니다
            </p>

            {/* 단계 — 위에서부터 */}
            <nav aria-label="점수 구간" className="mt-3 flex flex-wrap items-center gap-1.5">
              {BANDS.map((b) => {
                const n = inBand(open, b).filter((r) => !r.dropped).length;
                const ok = passed?.has(b) && n === 0;                // 통과했고 새로 들어온 사진도 없다
                const here = show === "band" && band === b;
                return (
                  <Link key={b} href={famUrl(family.key, { band: String(b) })} aria-current={here ? "true" : undefined}
                    className={`rounded-lg border px-2.5 py-1 text-caption tabular-nums ${here ? "border-brand bg-brand/10 font-semibold text-brand"
                      : ok ? "border-success text-success-ink" : n ? "border-line hover:border-fg/40" : "border-dashed border-line text-muted/50"}`}>
                    {ok ? "✓ " : ""}{b.toFixed(2)}{bandTop(b) === Infinity ? "+" : ""} <span className="opacity-70">{ok ? passed!.get(b)!.length : passed?.has(b) ? `새 ${n}` : n}</span>
                  </Link>
                );
              })}
              <span className="mx-1 text-muted">|</span>
              <Link href={famUrl(family.key, { show: "done" })} aria-current={show === "done" ? "true" : undefined}
                className={`rounded-lg border px-2.5 py-1 text-caption ${show === "done" ? "border-brand bg-brand/10 font-semibold text-brand" : "border-success text-success-ink"}`}>확정된 사진 {doneIds.length}</Link>
              <Link href={famUrl(family.key, { show: "all" })} aria-current={show === "all" ? "true" : undefined}
                className={`rounded-lg border px-2.5 py-1 text-caption ${show === "all" ? "border-brand bg-brand/10 font-semibold text-brand" : "border-line text-muted"}`}>전체 {rows.length}</Link>
              <span className="ml-auto flex gap-1.5">
                <Verdict k={family.key} status="pass" label="가족 검수 끝" tone="border-success text-success-ink" />
                <Verdict k={family.key} status="rewrite" label="문장 고칠 것" tone="border-warning text-warning-ink" />
                {status !== "todo" && <Verdict k={family.key} status="todo" label="판정 지우기" tone="border-line text-muted" />}
              </span>
            </nav>

            {show === "band" && band !== null && (
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-body font-semibold">z {bandLabel(band)} 구간 — {bandRows.length}장</h3>
                  {passed?.has(band) ? (
                    <>
                      <span className="rounded-lg border border-success px-2 py-0.5 text-caption text-success-ink">
                        통과함 — {passed.get(band)!.length}장 확정{openHere.length ? ` · 다시 계산해 새로 들어온 ${openHere.filter((r) => !r.dropped).length}장` : ""}
                      </span>
                      <form action={undoBand}>
                        <input type="hidden" name="key" value={family.key} />
                        <input type="hidden" name="band" value={band} />
                        <button className="text-caption text-muted underline underline-offset-2">확정 취소</button>
                      </form>
                    </>
                  ) : null}
                  <span className="ml-auto flex items-center gap-1.5">
                    {!showingDone && bandRows.some((r) => !r.dropped) && <BandAll k={family.key} band={band} action="drop" label={`이 구간 다 빼기 (${bandRows.filter((r) => !r.dropped).length})`} tone="border-danger/50 text-danger-ink" />}
                    {bandRows.some((r) => r.dropped) && <BandAll k={family.key} band={band} action="keep" label={`다 되살리기 (${bandRows.filter((r) => r.dropped).length})`} tone="border-line text-muted" />}
                  </span>
                  <form action={confirmBand}>
                    <input type="hidden" name="key" value={family.key} />
                    <input type="hidden" name="band" value={band} />
                    <button disabled={showingDone || !openHere.some((r) => !r.dropped)} className="rounded-xl border-2 border-success bg-success-soft px-4 py-1.5 text-body-sm font-semibold text-success-ink disabled:opacity-40">
                      {passed?.has(band) ? "새 사진 통과" : "이 구간 통과"} — {openHere.filter((r) => !r.dropped).length}장 확정 →
                    </button>
                  </form>
                </div>
                <p className="mt-1 text-caption text-muted">
                  틀린 사진만 [빼기](또는 사진을 누르기)로 한 장씩 빼고, 나머지가 맞으면 [이 구간 통과]. 구간 전체가 틀렸으면 [이 구간 다 빼기]. 남은 사진이 「{family.name}」 태그로 확정되고 다음 구간으로 넘어갑니다.
                </p>
                <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {bandRows.map((r) => <PhotoCell key={r.photo} r={r} k={family.key} url={thumbs.get(r.photo)} done={showingDone || (confirmedSet.has(r.photo) && !r.dropped)} />)}
                </ul>
                {showingDone && <p className="mt-2 text-caption text-muted">새로 볼 사진이 없습니다 — 아래는 이 구간에서 확정한 사진입니다.</p>}
                {!bandRows.length && <p className="mt-2 text-caption text-muted">이 구간에는 사진이 없습니다.</p>}
              </div>
            )}

            {show === "done" && (
              <div className="mt-4">
                <h3 className="text-body font-semibold">확정된 사진 — {doneIds.length}장</h3>
                <p className="text-caption text-muted">구간을 통과해 「{family.name}」 태그로 확정된 사진입니다. 문장을 고쳐 다시 계산해도 확정은 그대로 남습니다(점수 「—」 는 지금 후보에서 빠진 사진). 여기서 빼면 확정에서 빠집니다.</p>
                <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {doneShown.map((id) => <PhotoCell key={id} r={asRow(id)} k={family.key} url={thumbs.get(id)} done />)}
                </ul>
                {!doneIds.length && <p className="mt-2 text-caption text-muted">아직 확정한 사진이 없습니다 — 구간을 통과하면 여기 쌓입니다.</p>}
                <Pager total={doneIds.length} page={page} href={(p) => famUrl(family.key, { show: "done", p: String(p) })} />
              </div>
            )}

            {show === "all" && (
              <div className="mt-4">
                <h3 className="text-body font-semibold">전체 — 점수 높은 순 {rows.length}장</h3>
                <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {shown.map((r) => <PhotoCell key={r.photo} r={r} k={family.key} url={thumbs.get(r.photo)} done={doneIds.includes(r.photo)} />)}
                </ul>
                <Pager total={rows.length} page={page} href={(p) => famUrl(family.key, { show: "all", p: String(p) })} />
              </div>
            )}
          </div>
        );
      })()}

      {view === "family" && !family && <p className="mt-6 rounded-xl border border-line p-8 text-center text-muted">모든 가족의 검수가 끝났습니다. 칩을 눌러 다시 볼 수 있습니다.</p>}
      {view === "confirmed" && !family && (
        <p className="mt-6 rounded-xl border border-line p-8 text-center text-muted">
          구간을 통과해 확정한 사진을 가족마다 모아 둡니다(mood-edits/photo-mood-tag-confirmed.jsonl). 칩을 누르면 그 가족의 확정된 사진이 나옵니다.
        </p>
      )}

      {view === "big" && !key && <p className="mt-6 rounded-xl border border-line p-8 text-center text-muted">큰 무드는 가족에서 물려받습니다 — 검수는 가족에서 하고, 여기서는 결과를 봅니다.</p>}
      {view === "big" && key && (
        <div className="mt-5">
          <p className="text-body-sm"><b>{bigName.get(key)}</b> <span className="text-muted">— 가족에서 물려받은 사진 {rows.length}장(점수 높은 순)</span></p>
          <BigMoodNameForm id={key} name={bigName.get(key) ?? ""} />
          {(() => {
            // 이 큰 무드에 든 가족과 그 설명(사람 요청 2026-10-04) — 무엇이 모여 이 큰 무드가 됐는지 사진 위에서 본다
            const inside = order.filter((f) => f.big === key);
            const moodNote = noteFor({ members: inside.flatMap((f) => f.bundles) }, notes.moods)?.note;
            return (
              <div className="mt-2 rounded-xl border border-line p-3">
                {moodNote && <p className="text-body-sm text-muted">{moodNote}</p>}
                <ul className="mt-2 space-y-2">
                  {inside.map((f) => (
                    <li key={f.key} className="text-body-sm">
                      <Link href={famUrl(f.key)} className="font-semibold underline-offset-2 hover:underline">{f.name}</Link>
                      <span className="ml-1.5 text-caption tabular-nums text-muted">{f.key.toUpperCase()} · 사진 {counts.family.get(f.key) ?? 0} · 확정 {confirmedOf(f.key).length}</span>
                      <span className={`ml-1.5 rounded-lg border px-1.5 py-0.5 text-caption ${STATUS[statusOf(f.key)].chip}`}>{STATUS[statusOf(f.key)].label}</span>
                      <p className="text-caption text-muted">{noteFor({ members: f.bundles }, notes.families)?.note ?? ""}</p>
                      <p className="mt-1 flex flex-wrap gap-1">
                        {clustersIn(f.bundles, clusterData?.clusters ?? []).map((g) => (
                          <span key={g.join("|")} className={`rounded-lg border px-1.5 py-0.5 text-caption ${g.length > 1 ? "border-brand/50 text-fg" : "border-line text-muted"}`}>{g.join(" ≈ ")}</span>
                        ))}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((r) => (
              <li key={r.photo} className="rounded-xl border border-line p-1.5">
                <PhotoThumb id={r.photo} url={thumbs.get(r.photo)} />
                <p className="mt-1 text-caption tabular-nums text-muted">z {r.z.toFixed(1)}</p>
              </li>
            ))}
          </ul>
          <Pager total={rows.length} page={page} href={(p) => `${BASE}?view=big&key=${key}&p=${p}`} />
        </div>
      )}

      {view === "empty" && (
        <div className="mt-5">
          <p className="text-caption text-muted">어느 가족도 기준을 못 넘은 사진 {untagged.length}장 — 아깝게 놓친 것부터. 사진 아래는 가장 가까웠던 가족 셋과 그 점수입니다.</p>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {untagged.map((r) => (
              <li key={r.photo} className="rounded-xl border border-line p-1.5">
                <PhotoThumb id={r.photo} url={thumbs.get(r.photo)} />
                <p className="mt-1 text-caption text-muted">
                  {r.near.map(([k, z]) => <span key={k} className="mr-1.5 inline-block">{famName.get(k)} <span className="tabular-nums">{z.toFixed(1)}</span></span>)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** 구간 사진 한꺼번에 빼기 · 되살리기 */
function BandAll({ k, band, action, label, tone }: { k: string; band: number; action: "drop" | "keep"; label: string; tone: string }) {
  return (
    <form action={dropBand}>
      <input type="hidden" name="key" value={k} />
      <input type="hidden" name="band" value={band} />
      <input type="hidden" name="action" value={action} />
      <button className={`rounded-xl border px-3 py-1.5 text-body-sm ${tone}`}>{label}</button>
    </form>
  );
}

function Verdict({ k, status, label, tone }: { k: string; status: FamilyReviewStatus; label: string; tone: string }) {
  return (
    <form action={reviewFamily}>
      <input type="hidden" name="key" value={k} />
      <input type="hidden" name="status" value={status} />
      <button className={`rounded-xl border-2 px-3 py-1.5 text-body-sm font-medium ${tone}`}>{label}</button>
    </form>
  );
}

/** 사진 칸 — 사진 한 장씩만 뺀다(사람 결정 2026-10-01). 사진을 눌러도, [빼기] 를 눌러도 같다. 확정된 사진은 초록 테두리 */
function PhotoCell({ r, k, url, done }: { r: TaggedPhotoRow; k: string; url?: string; done?: boolean }) {
  return (
    <li className={`rounded-xl border p-1.5 ${done ? "border-success" : "border-line"}`}>
      <DropThumb id={r.photo} url={url} layer="family" k={k} dropped={r.dropped} />
      <div className="mt-1 flex flex-wrap items-center gap-1 text-caption">
        <span className="tabular-nums text-muted">z {Number.isNaN(r.z) ? "—" : r.z.toFixed(2)}</span>
        {r.byTag && <span className="rounded border border-line px-1 text-muted">태그</span>}
        {done && <span className="text-success-ink">확정</span>}
        <TagButton photo={r.photo} layer="family" k={k} dropped={r.dropped} />
      </div>
    </li>
  );
}

function Pager({ total, page, href }: { total: number; page: number; href: (p: number) => string }) {
  if (total <= PAGE) return null;
  return (
    <nav aria-label="쪽" className="mt-3 flex flex-wrap gap-1.5">
      {Array.from({ length: Math.ceil(total / PAGE) }, (_, i) => (
        <Link key={i} href={href(i)} aria-current={i === page ? "page" : undefined}
          className={`rounded-lg border px-2.5 py-1 text-caption tabular-nums ${i === page ? "border-brand text-brand" : "border-line text-muted"}`}>{i + 1}</Link>
      ))}
    </nav>
  );
}

/** 큰 무드 이름 고치기 — 무드 › 가족 화면과 같은 기록(photo-mood-names.jsonl)에 남는다 */
function BigMoodNameForm({ id, name }: { id: string; name: string }) {
  return (
    <form action={nameBigMood} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input key={`${id}-${name}`} name="name" defaultValue={name} maxLength={30} aria-label="큰 무드 이름" placeholder="이름 짓기"
        className="w-56 rounded-xl border-2 border-danger bg-bg px-3 py-1.5 text-body-sm" />
      <button className="rounded-xl border border-line px-3 py-1.5 text-body-sm hover:border-fg/40">이름 저장</button>
    </form>
  );
}
