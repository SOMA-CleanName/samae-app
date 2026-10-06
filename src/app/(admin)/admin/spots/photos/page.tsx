import Link from "next/link";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { SpotsTabs } from "../SpotsTabs";
import { SPOT_MIN_PHOTOS } from "@/lib/spot-live";
import {
  listPhotosOfSpot,
  loadSpotLinkOverview,
  searchPhotosForSpots,
  type AdminSpotPhoto,
  type SpotLinkSummary,
} from "@/lib/spot-photos";
import {
  addSpotPhoto,
  excludeSpotPhoto,
  includeSpotPhoto,
  promoteSpotPhoto,
  recomputeNow,
  removeManualSpotPhoto,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { spot?: string; view?: string; q?: string };

const CHIP = "h-7 rounded-full px-3 text-caption font-medium transition-colors";
const SMALL_BTN =
  "rounded-full border border-line-strong px-2.5 py-1 text-caption font-medium text-muted transition-colors hover:bg-fg/[0.04] disabled:opacity-50";

function kst(iso: string | null): string {
  if (!iso) return "아직 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * 장소별 사진 — 장소마다 어떤 사진이 걸리는지 보고 고친다(spot_photos, 0145).
 *
 * 장소 정보(이름·주소·키워드·공개)는 「촬영 장소」(/admin/spots)에서 고친다. 여기는 **사진 쪽**만 다룬다.
 * 자동 매칭(키워드 ↔ 사진 장소 메모)은 매일 09:00 다시 계산되고, 여기서 한 일(빼기 · 넣기)은 지켜진다.
 * 작가가 적은 장소 메모(location_text)는 고치지 않는다 — 작가의 입력을 우리가 덮어쓰지 않는다(lib/location-text).
 */
export default async function AdminSpotPhotosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const overview = await loadSpotLinkOverview();

  if (!overview) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
        <SpotsTabs current="photos" />
        <h1 className="text-h1 font-semibold">장소별 사진</h1>
        <p className="mt-4 rounded-xl border border-warning/30 bg-warning-soft/40 p-4 text-body-sm text-warning-ink">
          <b>spot_photos 표가 아직 없어요.</b> 마이그레이션 <code>0145_spot_photos.sql</code> 을 운영 DB 에 적용한 뒤
          「지금 다시 계산」을 누르세요. 그전까지 지면은 예전처럼 키워드로 바로 매칭합니다.
        </p>
      </main>
    );
  }

  const { summaries, lastComputedAt } = overview;
  const finding = params.view === "find";
  const current = finding
    ? null
    : summaries.find((s) => s.spot.slug === params.spot) ??
      [...summaries].sort((a, b) => b.included - a.included)[0] ??
      null;

  const photos: AdminSpotPhoto[] = finding
    ? await searchPhotosForSpots(params.q ?? "")
    : current
      ? await listPhotosOfSpot(current.spot.id)
      : [];
  const spotName = new Map(summaries.map((s) => [s.spot.id, s.spot.name]));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-5">
      <SpotsTabs current="photos" />
      <h1 className="text-h1 font-semibold">장소별 사진</h1>
      <p className="mt-1 text-body-sm leading-relaxed text-muted">
        촬영 장소마다 어떤 사진이 걸리는지 봅니다. 사진의 장소 메모에 장소 키워드가 들어 있으면{" "}
        <b className="font-semibold text-fg">자동</b>으로 붙고, 틀린 건 <b className="font-semibold text-fg">빼고</b>, 메모가
        없어도 그 장소 사진이면 <b className="font-semibold text-fg">직접 넣을</b> 수 있어요.
      </p>
      <p className="mt-1.5 text-caption leading-relaxed text-faint">
        장소 이름·키워드·공개는 <Link href="/admin/spots" className="underline">장소 정보</Link> 탭에서 고칩니다. 키워드를
        저장하면 바로 다시 계산돼요. 지면에는 공개 사진이 {SPOT_MIN_PHOTOS}장 이상인 공개 장소만 실립니다.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 text-body-sm">
        <span className="text-muted">
          마지막 자동 계산 <b className="font-semibold text-fg">{kst(lastComputedAt)}</b> · 매일 09:00
        </span>
        <form action={recomputeNow} className="ml-auto">
          <SubmitButton pendingText="계산 중…" className={SMALL_BTN}>
            지금 다시 계산
          </SubmitButton>
        </form>
      </div>

      {/* 장소 고르기 */}
      <nav className="mt-5 flex flex-wrap gap-1.5" aria-label="장소">
        {summaries.map((s) => (
          <SpotChip key={s.spot.id} summary={s} active={current?.spot.id === s.spot.id} />
        ))}
        <Link
          href="/admin/spots/photos?view=find"
          className={`${CHIP} inline-flex items-center border ${
            finding ? "border-fg bg-fg text-bg" : "border-dashed border-line-strong text-muted hover:bg-fg/[0.04]"
          }`}
        >
          + 사진 찾아 넣기
        </Link>
      </nav>

      {current && <SpotHeader summary={current} photos={photos} />}

      {finding && (
        <section className="mt-6">
          <form className="flex gap-2" action="/admin/spots/photos">
            <input type="hidden" name="view" value="find" />
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="장소 메모로 찾기 (예: 을지로, 한강)"
              className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-body-sm outline-none focus:border-fg/40"
            />
            <button type="submit" className="h-9 rounded-lg bg-fg px-4 text-body-sm font-semibold text-bg">
              찾기
            </button>
          </form>
          <p className="mt-2 text-caption text-faint">
            {params.q?.trim()
              ? `장소 메모에 「${params.q.trim()}」 가 들어간 사진 (최근 60장)`
              : "검색어가 없으면 — 장소 메모는 있는데 어느 장소에도 안 붙은 공개 사진 (최근 60장)"}
          </p>
        </section>
      )}

      {photos.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line bg-surface p-4 text-body-sm text-muted">
          {finding ? "해당하는 사진이 없어요." : "이 장소에 붙은 사진이 없어요. 키워드를 확인하거나 사진을 직접 넣으세요."}
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((p) => (
            <PhotoCard
              key={p.photoId}
              photo={p}
              currentSpotId={current?.spot.id ?? null}
              spotName={spotName}
              summaries={summaries}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function SpotChip({ summary: s, active }: { summary: SpotLinkSummary; active: boolean }) {
  return (
    <Link
      href={`/admin/spots/photos?spot=${encodeURIComponent(s.spot.slug)}`}
      className={`${CHIP} inline-flex items-center gap-1.5 border ${
        active ? "border-fg bg-fg text-bg" : "border-line-strong bg-surface text-fg hover:bg-fg/[0.04]"
      }`}
    >
      {s.spot.name}
      <span className={active ? "text-bg/70" : "text-faint"}>{s.included}</span>
      {!s.spot.published && <span className={active ? "text-bg/70" : "text-faint"}>· 비공개</span>}
    </Link>
  );
}

function SpotHeader({ summary: s, photos }: { summary: SpotLinkSummary; photos: AdminSpotPhoto[] }) {
  // 지면에 실제로 뜨는 수 — 뺀 것 · 나열형 자동 매칭 · 비공개 사진을 뺀 값(lib/spots 와 같은 규칙)
  const shown = photos.filter((p) => {
    const l = p.links.find((x) => x.spotId === s.spot.id);
    return l && !l.excluded && (l.source === "manual" || !p.listed) && p.visible;
  }).length;
  return (
    <section className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="text-h2 font-semibold">{s.spot.name}</h2>
      <span className="text-body-sm text-muted">
        지면에 뜨는 사진 <b className="font-semibold text-fg">{shown}장</b> · 연결 {s.included}
        {s.manual > 0 && ` (직접 ${s.manual})`}
        {s.excluded > 0 && ` · 뺀 것 ${s.excluded}`}
      </span>
      <span className="text-caption text-faint">
        키워드: {s.spot.keywords.length ? s.spot.keywords.join(", ") : "없음"} ·{" "}
        {s.spot.published ? "공개" : "비공개"}
        {s.spot.published && shown < SPOT_MIN_PHOTOS && ` · ${SPOT_MIN_PHOTOS}장 미만이라 지면에 안 실림`}
      </span>
    </section>
  );
}

function PhotoCard({
  photo: p,
  currentSpotId,
  spotName,
  summaries,
}: {
  photo: AdminSpotPhoto;
  currentSpotId: string | null;
  spotName: Map<string, string>;
  summaries: SpotLinkSummary[];
}) {
  const here = currentSpotId ? p.links.find((l) => l.spotId === currentSpotId) : undefined;
  const others = p.links.filter((l) => l.spotId !== currentSpotId);
  const linkedIds = new Set(p.links.map((l) => l.spotId));

  return (
    <li
      className={`overflow-hidden rounded-xl border border-line bg-surface ${here?.excluded ? "opacity-60" : ""}`}
    >
      <a href={`/photos/${p.photoId}`} target="_blank" rel="noreferrer" className="relative block aspect-square">
        <img
          src={p.thumbUrl ?? p.srcUrl}
          alt=""
          loading="lazy"
          className={`h-full w-full object-cover ${here?.excluded ? "grayscale" : ""}`}
        />
        <span className="absolute left-1.5 top-1.5 flex gap-1">
          {here && (
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              {here.source === "manual" ? "직접" : "자동"}
            </span>
          )}
          {here?.excluded && (
            <span className="rounded bg-warning px-1.5 py-0.5 text-[11px] font-semibold text-bg">뺌</span>
          )}
          {here && !here.excluded && here.source === "auto" && p.listed && (
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              나열 · 지면 제외
            </span>
          )}
          {!p.visible && (
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">비공개</span>
          )}
        </span>
      </a>

      <div className="space-y-1.5 p-2.5">
        <p className="line-clamp-2 text-caption leading-snug">
          {p.locationText?.trim() ? p.locationText : <span className="text-faint">장소 메모 없음</span>}
        </p>
        {p.photographerName && <p className="text-[11px] text-faint">{p.photographerName}</p>}
        {others.length > 0 && (
          <p className="text-[11px] text-muted">
            {currentSpotId ? "다른 장소: " : "붙은 장소: "}
            {others
              .map((l) => `${spotName.get(l.spotId) ?? "?"}${l.excluded ? "(뺌)" : l.source === "manual" ? "(직접)" : ""}`)
              .join(", ")}
          </p>
        )}

        {/* 이 장소에서의 동작 */}
        {here && currentSpotId && (
          <form
            action={
              here.source === "manual" ? removeManualSpotPhoto : here.excluded ? includeSpotPhoto : excludeSpotPhoto
            }
          >
            <input type="hidden" name="spot_id" value={currentSpotId} />
            <input type="hidden" name="photo_id" value={p.photoId} />
            <SubmitButton pendingText="저장 중…" className={SMALL_BTN}>
              {here.source === "manual" ? "직접 넣은 것 지우기" : here.excluded ? "되살리기" : "이 장소에서 빼기"}
            </SubmitButton>
          </form>
        )}
        {/* 나열형 자동 매칭은 지면에 안 뜬다 — 이 장소엔 띄우고 싶으면 싣는다(manual 이 된다) */}
        {here && currentSpotId && here.source === "auto" && !here.excluded && p.listed && (
          <form action={promoteSpotPhoto}>
            <input type="hidden" name="spot_id" value={currentSpotId} />
            <input type="hidden" name="photo_id" value={p.photoId} />
            <SubmitButton pendingText="저장 중…" className={SMALL_BTN}>
              이 장소 지면에 싣기
            </SubmitButton>
          </form>
        )}

        {/* 다른 장소에 직접 넣기 */}
        <form action={addSpotPhoto} className="flex gap-1">
          <input type="hidden" name="photo_id" value={p.photoId} />
          <select
            name="spot_id"
            defaultValue=""
            className="h-7 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-1.5 text-[11px]"
          >
            <option value="" disabled>
              장소에 넣기…
            </option>
            {summaries
              .filter((s) => !linkedIds.has(s.spot.id))
              .map((s) => (
                <option key={s.spot.id} value={s.spot.id}>
                  {s.spot.name}
                </option>
              ))}
          </select>
          <SubmitButton pendingText="…" className={SMALL_BTN}>
            넣기
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}
