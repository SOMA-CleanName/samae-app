import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMyNewInquiries, listMyAcceptedInquiries } from "@/lib/inquiries";
import { getPlatformAccount } from "@/lib/platform-account";
import { StudioInquiries } from "./StudioInquiries";

export const dynamic = "force-dynamic";

// 작가 스튜디오 홈 — 신청 상태별 분기. 승인 작가는 문의 허브(리드 모델).
export default async function StudioHome() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio");

  const ph = me.photographer;

  // 미신청/대기/반려/정지 — 상태 카드만 (레이아웃이 사이드바를 안 씌움)
  if (!ph || ph.status !== "approved") {
    return (
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-10 font-kr">
        <Link href="/" className="text-sm text-fg/50 hover:text-fg">
          ← 탐색으로
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">작가 스튜디오</h1>

        {!ph && (
          <div className="mt-6 rounded-xl border border-fg/10 p-6">
            <p className="text-sm text-fg/70">
              아직 작가로 등록되지 않았어요. 신청하고 승인받으면 탐색 탭에 노출됩니다.
            </p>
            <Link
              href="/studio/apply"
              className="mt-4 inline-block rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg hover:opacity-90"
            >
              작가 신청하기
            </Link>
          </div>
        )}
        {ph?.status === "pending" && (
          <StatusCard tone="wait" title="승인 대기 중" desc="운영자 검토 후 활동을 시작할 수 있어요. 보통 영업일 기준 1~2일 소요됩니다." displayName={ph.displayName} />
        )}
        {ph?.status === "rejected" && (
          <StatusCard tone="reject" title="신청이 반려되었어요" desc="자세한 사유는 안내 메시지를 확인해주세요." displayName={ph.displayName} />
        )}
        {ph?.status === "suspended" && (
          <StatusCard tone="reject" title="활동이 정지되었어요" desc="문의가 필요하면 운영자에게 연락해주세요." displayName={ph.displayName} />
        )}
      </main>
    );
  }

  // ── 승인 작가 — 문의 허브 ──────────────────────────────────────
  const [newItems, acceptedItems, account] = await Promise.all([
    listMyNewInquiries(),
    listMyAcceptedInquiries(),
    getPlatformAccount(),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8 font-kr">
      <h1 className="text-2xl font-semibold">문의</h1>
      <p className="mt-1 text-sm text-fg/50">
        <b className="text-fg/70">{ph.displayName}</b> 작가님, 새 문의를 확인하고 수락해보세요.
      </p>

      <div className="mt-6">
        <StudioInquiries newItems={newItems} acceptedItems={acceptedItems} account={account} />
      </div>
    </main>
  );
}

function StatusCard({
  tone,
  title,
  desc,
  displayName,
}: {
  tone: "wait" | "reject";
  title: string;
  desc: string;
  displayName: string;
}) {
  const color =
    tone === "wait" ? "border-amber-500/20 bg-amber-500/[0.06]" : "border-brand/20 bg-brand/[0.06]";
  return (
    <div className={`mt-6 rounded-xl border p-6 ${color}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-fg/65">{desc}</p>
      <p className="mt-3 text-xs text-fg/45">작가명: {displayName}</p>
    </div>
  );
}