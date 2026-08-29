import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADULT_AGE, ageYears } from "@/lib/casting";
import { PickedPhotoLink } from "./PickedPhotoLink";

export const metadata: Metadata = { title: "내 캐스팅 신청" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  new: { text: "심사 중", tone: "bg-fg/[0.07] text-fg/60" },
  shortlisted: { text: "예비 명단", tone: "bg-warning-soft text-warning" },
  selected: { text: "선정 ✨", tone: "bg-success-soft text-success" },
  rejected: { text: "이번엔 아쉽게도", tone: "bg-fg/[0.07] text-fg/50" },
};

export default async function CastingMyPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/casting/my");

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("casting_applications")
    .select(
      "id, status, birth_date, guardian_name, guardian_consent_path, preferred_photo_ids, notified_at, created_at, round:casting_rounds!inner(title, slug, status, closes_at)",
    )
    .eq("profile_id", me.id)
    .neq("status", "withdrawn")
    .order("created_at", { ascending: false });

  const apps = rows ?? [];

  // 고른 사진 — 탈락 안내에서 되돌려 보여주는 전환 소재.
  // 작가 프로필 링크보다 강하다: 이미 본인이 좋다고 표시한 바로 그 이미지라서.
  const allPhotoIds = [...new Set(apps.flatMap((a) => (a.preferred_photo_ids as string[]) ?? []))];
  const photoById = new Map<string, { url: string; name: string }>();
  if (allPhotoIds.length > 0) {
    const { data: photos } = await admin
      .from("photos")
      .select("id, thumb_url, src_url, photographer:photographers!photos_photographer_id_fkey(display_name)")
      .in("id", allPhotoIds);
    for (const p of photos ?? []) {
      const ph = (Array.isArray(p.photographer) ? p.photographer[0] : p.photographer) as {
        display_name: string | null;
      } | null;
      photoById.set(p.id as string, {
        url: (p.thumb_url || p.src_url) as string,
        name: ph?.display_name ?? "작가",
      });
    }
  }

  return (
    <main className="mx-auto max-w-lg px-3.5 py-10 sm:px-5 font-kr">
      <h1 className="text-2xl font-semibold">내 캐스팅 신청</h1>

      {apps.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6">
          <p className="text-sm text-fg/60">아직 신청 내역이 없어요.</p>
          <Link href="/casting" className="mt-3 inline-block text-sm font-medium underline underline-offset-4">
            모집 중인 회차 보기
          </Link>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {apps.map((a) => {
            const round = (Array.isArray(a.round) ? a.round[0] : a.round) as {
              title: string;
              slug: string;
              status: string;
            };
            const label = STATUS_LABEL[a.status as string] ?? STATUS_LABEL.new;
            const age = ageYears(a.birth_date as string);
            const isMinor = age !== null && age < ADULT_AGE;
            const needsConsent = isMinor && !a.guardian_consent_path;
            const picks = ((a.preferred_photo_ids as string[]) ?? [])
              .map((id) => ({ id, ...photoById.get(id) }))
              .filter((p): p is { id: string; url: string; name: string } => Boolean(p.url));

            return (
              <li key={a.id as string} className="rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-semibold">{round.title}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${label.tone}`}>
                    {label.text}
                  </span>
                </div>

                {picks.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-medium text-fg/45">고르신 사진</p>
                    <div className="mt-1.5 flex gap-2">
                      {picks.map((p) => (
                        <PickedPhotoLink
                          key={p.id}
                          photoId={p.id}
                          url={p.url}
                          photographerName={p.name}
                          applicationStatus={a.status as string}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 미성년 동의서 미제출 — 선정 자체가 막히므로 가장 눈에 띄게 */}
                {needsConsent && (
                  <div className="mt-4 rounded-xl border border-warning/30 bg-warning-soft p-4">
                    <p className="text-sm font-semibold">보호자 동의서가 아직 없어요</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-fg/60">
                      동의서가 없으면 선정될 수 없어요. 마감 전까지 올려주세요.
                    </p>
                    <Link
                      href="/casting"
                      className="mt-2.5 inline-block text-xs font-medium underline underline-offset-4"
                    >
                      동의서 올리러 가기
                    </Link>
                  </div>
                )}

                {a.status === "rejected" && a.notified_at && (
                  <p className="mt-3 text-xs leading-relaxed text-fg/55">
                    다음 회차 대기 명단에 올려두었어요. 열리면 가장 먼저 알려드릴게요.
                  </p>
                )}

                {a.status === "selected" && a.notified_at && (
                  <p className="mt-3 rounded-xl bg-success-soft px-3.5 py-2.5 text-xs leading-relaxed text-success">
                    선정되셨어요! 촬영 일정과 장소는 따로 안내드릴게요.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Link href="/" className="mt-8 inline-block text-sm text-fg/50 hover:text-fg">
        ← 탐색으로
      </Link>
    </main>
  );
}
