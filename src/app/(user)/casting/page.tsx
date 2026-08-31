import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MpTrackOnce } from "@/components/MpTrackOnce";
import {
  daysLeft,
  interleaveByPhotographer,
  isAcceptingNow,
  shootPeriodLabel,
  type CastingPhotographer,
  type CastingPickPhoto,
  type CastingRound,
} from "@/lib/casting";
import { CastingForm } from "./CastingForm";
import { WaitlistButton } from "./WaitlistButton";

export const metadata: Metadata = {
  title: "무료 모델 모집",
  description: "사매 작가님들과 무료로 시즌 스냅을 찍을 모델을 모집해요.",
};
export const dynamic = "force-dynamic";

// 무료 모델 모집(캐스팅) — 설계: docs/29-model-casting-funnel.md
//
// 비로그인도 페이지와 폼 1~2단계를 볼 수 있다. 유입이 스레드·인스타 콜드 트래픽이라
// 첫 화면이 로그인 벽이면 대부분 이탈하기 때문. 로그인은 사진을 올리는 3단계에서 요구한다.
export default async function CastingPage() {
  const [me, admin] = [await getCurrentUser(), createAdminClient()];

  // 공개 대상 회차 — 진행 중인 것 우선, 없으면 가장 최근 것(마감 안내용)
  const { data: roundRow } = await admin
    .from("casting_rounds")
    .select("id, slug, title, status, opens_at, closes_at, shoot_from, shoot_to, capacity, description")
    .neq("status", "draft")
    .order("opens_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!roundRow) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">무료 모델 모집</h1>
        <p className="mt-3 text-sm text-fg/60">아직 열린 회차가 없어요. 곧 공개할게요.</p>
        <BackLink />
      </Shell>
    );
  }

  const round: CastingRound = {
    id: roundRow.id,
    slug: roundRow.slug,
    title: roundRow.title,
    status: roundRow.status,
    opensAt: roundRow.opens_at,
    closesAt: roundRow.closes_at,
    shootFrom: roundRow.shoot_from,
    shootTo: roundRow.shoot_to,
    capacity: roundRow.capacity,
    description: roundRow.description,
  };

  const accepting = isAcceptingNow(round);
  const dLeft = daysLeft(round);
  const period = shootPeriodLabel(round);

  // 이미 신청했는지
  let mine: { status: string } | null = null;
  if (me) {
    const { data } = await admin
      .from("casting_applications")
      .select("status")
      .eq("round_id", round.id)
      .eq("profile_id", me.id)
      .neq("status", "withdrawn")
      .maybeSingle();
    mine = data;
  }

  // 참여 작가 + 대표 사진
  const { data: joinRows } = await admin
    .from("casting_round_photographers")
    .select("photographer_id, sort_order, photographer:photographers!inner(id, display_name, regions, mood_tags)")
    .eq("round_id", round.id)
    .order("sort_order");

  const ids = (joinRows ?? []).map((r) => r.photographer_id as string);

  const photographers: CastingPhotographer[] = (joinRows ?? []).map((r) => {
    const p = (Array.isArray(r.photographer) ? r.photographer[0] : r.photographer) as {
      id: string;
      display_name: string | null;
      regions: string[] | null;
      mood_tags: string[] | null;
    };
    return {
      id: p.id,
      displayName: p.display_name ?? "작가",
      regions: p.regions ?? [],
      moodTags: p.mood_tags ?? [],
      coverUrl: null,
    };
  });
  const nameById = new Map(photographers.map((p) => [p.id, p.displayName]));

  // STEP 2 선택지 — 참여 작가들의 포트폴리오 **전체**.
  // 작가 이름이 아니라 사진을 고르게 하므로, 여기가 곧 미니 탐색 탭이 된다.
  // 개수를 자르지 않고 전부 내려준 뒤 클라이언트가 점진 노출한다(탐색 갤러리와 같은 방식).
  let pickPhotos: CastingPickPhoto[] = [];
  if (ids.length > 0) {
    const { data: photos } = await admin
      .from("photos")
      .select("id, photographer_id, thumb_url, src_url, width, height")
      .in("photographer_id", ids)
      .eq("visibility", "published")
      .eq("feed_hidden", false)
      .order("sort_order", { ascending: true });

    pickPhotos = interleaveByPhotographer(
      (photos ?? [])
        .filter((p) => p.thumb_url || p.src_url)
        .map((p) => ({
          id: p.id as string,
          url: (p.thumb_url || p.src_url) as string,
          width: (p.width as number | null) ?? 0,
          height: (p.height as number | null) ?? 0,
          photographerId: p.photographer_id as string,
          photographerName: nameById.get(p.photographer_id as string) ?? "작가",
        })),
    );
  }

  // 포트폴리오가 아직 없는 참여 작가 — 사진 선택 방식에서는 그리드에 뜨지 않는다.
  const shownPhotographerIds = new Set(pickPhotos.map((p) => p.photographerId));
  const missingPortfolio = photographers.filter((p) => !shownPhotographerIds.has(p.id));

  return (
    <Shell>
      <MpTrackOnce event="Casting View" props={{ round_slug: round.slug, accepting }} />

      {/* 히어로 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-fg px-2.5 py-1 text-[11px] font-bold text-bg">무료 촬영</span>
        {accepting && dLeft !== null && (
          <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-bold text-brand">
            마감 D-{dLeft}
          </span>
        )}
        {!accepting && (
          <span className="rounded-full bg-fg/[0.07] px-2.5 py-1 text-[11px] font-bold text-fg/50">
            {round.status === "open" ? "접수 준비 중" : "이번 회차 마감"}
          </span>
        )}
      </div>

      <h1 className="mt-3 text-[26px] font-semibold leading-tight">{round.title}</h1>
      {round.description && <p className="mt-3 text-sm leading-relaxed text-fg/65">{round.description}</p>}

      {/* 조건 요약 */}
      <dl className="mt-5 grid grid-cols-2 gap-2.5">
        <Stat label="선정 인원" value={round.capacity ? `${round.capacity}명` : "미정"} />
        <Stat label="참여 작가" value={`${photographers.length}명`} />
        <Stat label="촬영 시기" value={period ?? "협의"} />
        <Stat label="비용" value="전액 무료" />
      </dl>

      {/* 상호 무페이 — 신뢰 장치. "무료"만 강조하면 숨은 비용을 의심한다. */}
      <section className="mt-5 rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm font-semibold">왜 무료인가요?</p>
        <p className="mt-2 text-sm leading-relaxed text-fg/65">
          모델도 작가도 서로에게 돈을 받지 않아요. 모델은 <b className="font-semibold text-fg">촬영 원본과 보정본을 전부</b>{" "}
          가져가고(사용 제한 없어요), 작가는 <b className="font-semibold text-fg">작품과 사매 공식 계정 노출</b>을 가져가요.
          사매는 서비스를 소개할 사진이 필요하고요.
        </p>
        <p className="mt-2.5 text-sm leading-relaxed text-fg/65">
          작가님들도 무보수로 시간을 내주시는 촬영이에요. 숨은 비용이나 나중에 청구되는 금액은 없습니다.
        </p>
      </section>

      {/* 상태별 본문 */}
      {mine ? (
        <div className="mt-6 rounded-2xl border border-success/30 bg-success-soft p-6">
          <p className="text-base font-semibold text-success">이미 신청하셨어요</p>
          <p className="mt-1.5 text-sm text-fg/70">
            결과는 접수 마감 후 한 번에 알려드려요. 알림을 켜두시면 놓치지 않아요.
          </p>
          <Link href="/casting/my" className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
            내 신청 내용 보기
          </Link>
        </div>
      ) : accepting ? (
        <>
          {/* 참여 작가인데 포트폴리오가 없으면 사진 그리드에 뜰 방법이 없다 — 운영자에게만 보인다 */}
          {me?.role === "admin" && missingPortfolio.length > 0 && (
            <p className="mt-5 rounded-xl bg-warning-soft px-4 py-3 text-xs text-warning">
              ⚠️ 운영자 안내 — {missingPortfolio.map((p) => p.displayName).join(", ")} 님은 등록된 사진이 없어
              선택지에 나오지 않아요. 포트폴리오를 올려야 신청자가 고를 수 있어요.
            </p>
          )}
          <CastingForm
            round={round}
            photos={pickPhotos}
            photographerCount={photographers.length}
            isLoggedIn={Boolean(me)}
            defaultName={me?.displayName ?? ""}
          />
        </>
      ) : (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6">
          <p className="text-base font-semibold">이번 회차는 접수가 마감됐어요</p>
          <p className="mt-1.5 text-sm text-fg/65">
            다음 회차가 열리면 가장 먼저 알려드릴게요. 알림을 신청해두시면 놓치지 않아요.
          </p>
          <div className="mt-4">
            <WaitlistButton isLoggedIn={Boolean(me)} />
          </div>
        </div>
      )}

      <BackLink />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-lg px-3.5 py-10 sm:px-5 font-kr">{children}</main>;
}

function BackLink() {
  return (
    <Link href="/" className="mt-8 inline-block text-sm text-fg/50 hover:text-fg">
      ← 탐색으로
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
      <dt className="text-[11px] font-medium text-fg/45">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold">{value}</dd>
    </div>
  );
}
