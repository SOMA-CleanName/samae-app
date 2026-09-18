import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getBooking,
  getConversationIdFor,
  bookingStatusLabel,
  statusTone,
  fmtShootAt,
  daysSince,
} from "@/lib/bookings";
import { acceptBooking, rejectBooking, cancelBooking } from "@/app/actions/bookings";
import { markShot, confirmCompletion } from "@/app/actions/payments";
import {
  getPaymentByBooking,
  getFeeByBooking,
  ensureTransferRecord,
  PAYMENT_LABEL,
  FEE_LABEL,
} from "@/lib/payments";
import { getPlatformAccount, hasAccount } from "@/lib/platform-account";
import { getReviewByBooking } from "@/lib/reviews";
import { getDelivery, getDeliveryDownloads, signDeliveryAssets } from "@/lib/deliveries";
import { ReviewForm } from "./ReviewForm";
import { DeliveryUploader } from "./DeliveryUploader";
import { DeliveryGallery } from "./DeliveryGallery";
import { overdueDays } from "@/lib/delivery-deadline";

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(iso));
import { DepositGate } from "@/components/booking/DepositGate";
import { PortraitOptout } from "@/components/booking/PortraitOptout";
import { SupportButton } from "@/components/user/SupportButton";
import { MpTrackOnce } from "@/components/MpTrackOnce";

// 예약 상세 + 역할·상태별 액션
export default async function BookingDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  // me·예약은 서로 독립 → 병렬
  const [me, b] = await Promise.all([getCurrentUser(), getBooking(id)]);
  if (!me) redirect(`/login?next=/bookings/${id}`);
  if (!b) notFound();

  const isBuyer = b.user_id === me.id;
  const isOwner = !!me.photographer && b.photographer_id === me.photographer.id;
  const isAdmin = me.role === "admin";
  const fmt = new Intl.NumberFormat("ko-KR");

  // 결제·정산·후기·전달물·채팅방·송금계좌 — 모두 예약/역할에만 의존하고 서로 독립 →
  // 한 번에 병렬 조회(기존 8단계 직렬 제거). 조건 미충족 항목은 즉시 null/[] 로 해소.
  const needDelivery =
    b.status === "completed" || (isOwner && ["paid", "shot"].includes(b.status));
  const [payment, fee, review, delivery, downloads, convId, platformAccount] = await Promise.all([
    getPaymentByBooking(id),
    isOwner ? getFeeByBooking(id) : Promise.resolve(null),
    b.status === "completed" ? getReviewByBooking(id) : Promise.resolve(null),
    needDelivery ? getDelivery(id) : Promise.resolve(null),
    b.status === "completed"
      ? getDeliveryDownloads(id)
      : Promise.resolve([] as Awaited<ReturnType<typeof getDeliveryDownloads>>),
    getConversationIdFor(b.user_id, b.photographer_id),
    isBuyer && b.status === "accepted"
      ? ensureTransferRecord(id, b.amount_krw ?? 0).then(() => getPlatformAccount()) // 송금대기 레코드 보장(멱등) 후 사매 계좌 조회
      : Promise.resolve(null),
  ]);
  // 전달물 서명 URL — delivery 결과에 의존하므로 이후 단계
  const deliveryAssets = await signDeliveryAssets(delivery?.asset_paths ?? []);

  // 뒤로가기 — 채팅에서 들어왔으면 채팅방으로, 아니면 예약 목록으로
  const back =
    from === "chat" && convId
      ? { href: `/chat/${convId}`, label: "← 채팅" }
      : { href: "/bookings", label: "← 예약" };

  // 정체 단계 넛지 (경량 인앱 리마인더)
  let nudge: string | null = null;
  if (b.status === "accepted") {
    const d = daysSince(b.accepted_at);
    const tail = d > 0 ? ` · ${d}일째` : "";
    nudge = isBuyer
      ? `입금 대기 중${tail} — 사매 계좌로 입금 후 [입금 완료]를 눌러주세요.`
      : `고객 입금 대기 중${tail} — 사매가 입금을 확인하면 예약이 확정돼요.`;
  } else if (b.status === "delivered") {
    nudge = isBuyer
      ? "보정본이 전달됐어요 — 확인 후 거래 완료를 눌러주세요."
      : "고객의 전달 확인을 기다리고 있어요.";
  }
  const canRefund = (isBuyer || isAdmin) && ["paid", "shot", "delivered"].includes(b.status);
  const counterpart = isBuyer
    ? b.photographer?.display_name || "작가"
    : b.user?.display_name || "고객";

  return (
    <main className="mx-auto max-w-lg px-3.5 sm:px-5 py-8 font-kr">
      {/* 예약 상세 진입 — 예약 상태별 이탈/전환 분석 */}
      <MpTrackOnce
        event="View Booking Detail"
        props={{ booking_id: id, status: b.status, viewer: isBuyer ? "buyer" : isOwner ? "photographer" : "admin" }}
      />
      <Link href={back.href} className="text-sm text-muted hover:text-fg">
        {back.label}
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">예약 상세</h1>
        <span className={`rounded-full px-2.5 py-1 text-xs ${statusTone(b.status)}`}>
          {bookingStatusLabel(b, isBuyer)}
        </span>
      </div>

      {/* 바로가기 — 채팅방 / (구매자) 작가 프로필 · 상단 배치(req3) */}
      <div className="mt-3 flex items-center gap-2">
        {convId && (
          <Link
            href={`/chat/${convId}`}
            className="rounded-full border border-fg/15 px-3 py-1.5 text-xs font-medium text-fg/70 hover:bg-fg/[0.04]"
          >
            💬 채팅방으로 가기
          </Link>
        )}
        {isBuyer && b.photographer && (
          <Link
            href={`/photographers/${b.photographer_id}`}
            className="rounded-full border border-fg/15 px-3 py-1.5 text-xs font-medium text-fg/70 hover:bg-fg/[0.04]"
          >
            작가 프로필 보기
          </Link>
        )}
      </div>

      <dl className="mt-6 flex flex-col gap-3 rounded-xl border border-fg/10 p-5 text-sm">
        <Row label={isBuyer ? "작가" : "고객"} value={counterpart} />
        <Row label="패키지" value={b.package?.name ?? b.package_snapshot?.name ?? "—"} />
        <Row label="일시" value={fmtShootAt(b.shoot_at, b.shoot_date)} />
        <Row label="장소" value={b.location_text || "—"} />
        {b.delivery_due_at && !b.delivered_at && ["paid", "shot"].includes(b.status) && (
          <Row
            label="전달 기한"
            value={`${fmtDay(b.delivery_due_at)}${(overdueDays(b.delivery_due_at) ?? 0) > 0 ? ` · ${overdueDays(b.delivery_due_at)}일 지남` : ""}`}
          />
        )}
        <Row label="금액" value={b.amount_krw ? `₩${fmt.format(b.amount_krw)}` : "—"} />
        {b.memo && <Row label="메모" value={b.memo} />}
        {payment && (
          <Row
            label="결제"
            value={
              PAYMENT_LABEL[payment.status] +
              (payment.refunded_krw > 0 ? ` · 환불 ₩${fmt.format(payment.refunded_krw)}` : "")
            }
          />
        )}
        {fee && (
          <Row
            label="매칭 수수료"
            value={`${FEE_LABEL[fee.status]} · ₩${fmt.format(fee.fee_krw)}`}
          />
        )}
      </dl>

      {/* 정체 단계 넛지 */}
      {nudge && (
        <p className="mt-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-ink">
          {nudge}
        </p>
      )}

      {/* 액션 */}
      <div className="mt-6 flex flex-col gap-2">
        {/* 수락/거절 — 제안자의 상대(작가 제안→구매자, 구매자 제안→작가) */}
        {b.status === "requested" &&
          (b.proposed_by_photographer ? isBuyer : isOwner) && (
          <div className="flex gap-2">
            <form action={acceptBooking} className="flex-1">
              <input type="hidden" name="id" value={b.id} />
              <button className="w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90">
                수락
              </button>
            </form>
            <form action={rejectBooking} className="flex-1">
              <input type="hidden" name="id" value={b.id} />
              <button className="w-full rounded-xl border border-fg/20 py-3 text-sm text-fg/70 hover:bg-fg/[0.04]">
                거절
              </button>
            </form>
          </div>
        )}

        {/* 구매자: 수락됨 → 입금 안내(사매 계좌·금액·입금완료) 인라인 노출 (req4) */}
        {isBuyer && b.status === "accepted" && (
          // 계좌·고지·동의·[입금 완료] 가 한 덩어리다 — 채팅의 AcceptPayDialog 와 같은
          // 게이트를 쓴다. 전에는 여기만 계좌와 버튼뿐이라 임박 예약 동의도 위약금 표도
          // 없이 결제가 됐고, 그러면 나중에 위약금을 주장할 근거가 없다.
          <DepositGate
            bookingId={b.id}
            amountKrw={b.amount_krw ?? 0}
            shootAt={b.shoot_at}
            shootDate={b.shoot_date}
            lateBookingConsentAt={b.late_booking_consent_at}
            transferMarkedAt={b.transfer_marked_at}
            account={
              platformAccount && hasAccount(platformAccount)
                ? {
                    bank: platformAccount.bank,
                    number: platformAccount.number,
                    holder: platformAccount.holder,
                  }
                : null
            }
          />
        )}

        {/* 작가: 수락됨 → 사매 입금 확인 대기 (확인 주체는 운영자 — 작가 직접 확인은 폐지) */}
        {isOwner && b.status === "accepted" && (
          <section className="rounded-xl border border-fg/12 bg-surface p-5">
            {b.transfer_marked_at ? (
              <p className="text-sm font-semibold text-success">
                💸 고객이 입금 완료를 알렸어요 — 사매가 확인 중이에요
              </p>
            ) : (
              <p className="text-sm text-fg/60">고객의 입금을 기다리는 중이에요</p>
            )}
            <p className="mt-1.5 text-xs text-faint">
              입금은 사매 계좌로 받고, 사매가 확인하면 예약이 확정돼요. 촬영비는 수수료 차감 후
              정산해드려요.
            </p>
          </section>
        )}

        {/* 작가: 결제됨 → 촬영 완료 */}
        {isOwner && b.status === "paid" && (
          <form action={markShot}>
            <input type="hidden" name="id" value={b.id} />
            <button className="w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90">
              촬영 완료 표시
            </button>
          </form>
        )}

        {/* 작가: 촬영됨 → 보정본 업로드·전달 (앱 내 전달 + 외부 링크) */}
        {isOwner && b.status === "shot" && (
          <DeliveryUploader
            bookingId={b.id}
            initialAssets={deliveryAssets}
            initialLink={delivery?.external_link ?? ""}
          />
        )}

        {/* 구매자: 전달됨 → 거래 완료 확인 */}
        {isBuyer && b.status === "delivered" && (
          <form action={confirmCompletion}>
            <input type="hidden" name="id" value={b.id} />
            <button className="w-full rounded-xl bg-success py-3 text-sm font-semibold text-white hover:opacity-90">
              전달 확인 · 거래 완료
            </button>
          </form>
        )}

        {/* 양측: 결제 전 취소 */}
        {["requested", "accepted"].includes(b.status) && (
          <form action={cancelBooking}>
            <input type="hidden" name="id" value={b.id} />
            <button className="w-full rounded-xl px-4 py-2.5 text-sm text-brand hover:bg-brand/[0.06]">
              예약 취소
            </button>
          </form>
        )}

        {/* 결제 후 환불 — 접수 창구를 [사매에 문의] 하나로 모은다.
            전에는 /bookings/[id]/refund 로 보냈는데, 그 화면은 리드 모델(작가가 촬영비를
            직접 받던 때) 것이라 "환불 금액도 작가가 직접 송금한다" 고 안내했다. 지금은
            사매가 대금을 보관하고 환불도 사매가 판정한다(/trust · docs/32).
            구간별 금액 계산과 실제 처리는 어드민 거래 관리(adminRefund)가 맡는다. */}
        {canRefund && isBuyer && (
          <SupportButton bookingId={b.id} conversationId={convId} variant="list" />
        )}
        {canRefund && isAdmin && !isBuyer && (
          <Link
            href="/admin/transactions"
            className="w-full rounded-xl px-4 py-2.5 text-center text-sm text-brand hover:bg-brand/[0.06]"
          >
            환불 처리 (거래 관리)
          </Link>
        )}
      </div>

      {/* 작가: 환불 처리됨 안내.
          ⚠️ 여기 있던 문구는 리드 시절 것이었다 — *"고객에게 직접 송금해 환불해주세요"*.
             작가가 촬영비를 자기 계좌로 받던 때의 안내다. 지금은 사매가 대금을 들고 있고
             환불도 사매가 한다(adminRefund). 그 문구를 보고 작가가 실제로 송금하면
             **이중 환불**이 된다. 정산 조정 금액은 알림으로 이미 안내된다
             (lib/payments.ts: "정산 금액은 ₩X 이에요" / "수수료 ₩X 이 작가님 부담으로 남아요"). */}
      {isOwner && b.status === "refunded" && (
        <section className="mt-6 rounded-xl border border-warning/30 bg-warning-soft p-5">
          <p className="text-sm font-semibold text-warning">↩️ 환불 처리된 예약이에요</p>
          <p className="mt-1.5 text-sm leading-relaxed text-warning/90">
            <b>작가님이 따로 송금하실 것은 없어요.</b> 사매가 고객에게 직접 환급하고, 이 예약의
            정산 금액은 그에 맞춰 조정됩니다. 조정된 금액은 정산 내역에서 확인할 수 있어요.
          </p>
          <Link
            href="/studio/settlements"
            className="mt-3 inline-block rounded-full bg-fg px-4 py-2 text-xs font-semibold text-bg hover:opacity-90"
          >
            정산 내역 보기
          </Link>
        </section>
      )}

      {/* 초상 사용 거부 — 작가약관 17조 4항·입점 동의서 5항이 약속한 권리를 행사하는 자리.
          입금이 확인된 뒤부터 보인다. 그 전에는 촬영이 성립하지도 않았고, 예약을 수락하기
          전에 묻는 건 고를 것도 없는 질문이다. */}
      {isBuyer && ["paid", "shot", "delivered", "completed"].includes(b.status) && (
        <PortraitOptout bookingId={id} initialOptedOut={!!b.portrait_optout_at} />
      )}

      {/* 작가 시점 — 지켜야 할 의무라 눈에 띄어야 한다. 사진을 올리기 전에 알아야 하므로
          전달 업로더보다 위에 둔다. */}
      {isOwner && b.portrait_optout_at && (
        <section className="mt-6 rounded-xl border border-warning/30 bg-warning-soft p-5">
          <p className="text-sm font-semibold text-warning">🔒 포트폴리오 사용 불가 예약이에요</p>
          <p className="mt-1.5 text-sm leading-relaxed text-warning/90">
            고객님이 이 촬영 결과물의 포트폴리오·홍보 사용을 원하지 않으세요. 이 촬영에서 나온
            사진은 <b>사매에 게재하실 수 없고</b>, 사매 홍보에도 쓰이지 않아요
            (작가 이용약관 제17조 4항 · 작가 입점 동의서 제5항). 이미 올리신 사진이 있으면
            내려주세요.
          </p>
        </section>
      )}

      {/* 보정본 갤러리 — 완료된 예약 (참여자) · 그리드+라이트박스+저장 (req10,11) */}
      {b.status === "completed" && (downloads.length > 0 || delivery?.external_link) && (
        <DeliveryGallery
          bookingId={id}
          items={downloads}
          externalLink={delivery?.external_link ?? null}
          expiresAt={delivery?.expires_at ?? null}
        />
      )}

      {/* 작가: 완료 후 보정본 잘못 전달 대처 — 파일 교체 + 재전달 알림 */}
      {isOwner && b.status === "completed" && (
        <section className="mt-6">
          <DeliveryUploader
            bookingId={b.id}
            initialAssets={deliveryAssets}
            initialLink={delivery?.external_link ?? ""}
            delivered
          />
        </section>
      )}

      {/* 후기 — 완료된 예약 */}
      {b.status === "completed" && (
        <section className="mt-6">
          {isBuyer ? (
            // 구매자: 작성 또는 수정
            <ReviewForm
              bookingId={b.id}
              initialRating={review?.rating ?? 0}
              initialBody={review?.body ?? ""}
            />
          ) : review ? (
            // 그 외(작가 등): 읽기 전용
            <div className="rounded-xl border border-fg/10 p-5">
              <p className="text-sm font-semibold">고객 후기</p>
              <p className="mt-1 text-warning">{"★".repeat(review.rating)}<span className="text-faint">{"★".repeat(5 - review.rating)}</span></p>
              {review.body && <p className="mt-2 text-sm text-fg/70">{review.body}</p>}
            </div>
          ) : (
            <p className="text-center text-sm text-faint">아직 후기가 없어요.</p>
          )}
        </section>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
