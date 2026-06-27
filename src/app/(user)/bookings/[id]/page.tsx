import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getBooking,
  getConversationIdFor,
  STATUS_LABEL,
  statusTone,
  fmtShootAt,
} from "@/lib/bookings";
import { acceptBooking, rejectBooking, cancelBooking } from "@/app/actions/bookings";
import {
  confirmTransfer,
  markShot,
  markTransferSent,
  confirmCompletion,
} from "@/app/actions/payments";
import {
  getPaymentByBooking,
  getFeeByBooking,
  getPayoutAccountForBooking,
  ensureTransferRecord,
  PAYMENT_LABEL,
  FEE_LABEL,
} from "@/lib/payments";
import { getReviewByBooking } from "@/lib/reviews";
import { getDelivery, getDeliveryDownloads, signDeliveryAssets } from "@/lib/deliveries";
import { ReviewForm } from "./ReviewForm";
import { DeliveryUploader } from "./DeliveryUploader";
import { DeliveryGallery } from "./DeliveryGallery";

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
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/bookings/${id}`);

  const b = await getBooking(id);
  if (!b) notFound();

  const isBuyer = b.user_id === me.id;
  const isOwner = !!me.photographer && b.photographer_id === me.photographer.id;
  const isAdmin = me.role === "admin";
  const fmt = new Intl.NumberFormat("ko-KR");

  // 결제·정산 정보 (RLS: 참여자/작가 본인만 조회됨)
  const payment = await getPaymentByBooking(id);
  const fee = isOwner ? await getFeeByBooking(id) : null;
  // 후기 — 완료된 예약만 (구매자는 작성/수정, 그 외 읽기)
  const review = b.status === "completed" ? await getReviewByBooking(id) : null;

  // 보정본 전달물 — 작가 업로드 현황(전달 단계) / 완료 후 다운로드(참여자)
  const delivery =
    b.status === "completed" || (isOwner && ["paid", "shot"].includes(b.status))
      ? await getDelivery(id)
      : null;
  const deliveryAssets = await signDeliveryAssets(delivery?.asset_paths ?? []);
  const downloads = b.status === "completed" ? await getDeliveryDownloads(id) : [];

  // 채팅방 바로가기 (B1)
  const convId = await getConversationIdFor(b.user_id, b.photographer_id);

  // 송금 안내 인라인 — 구매자·수락됨일 때 작가 계좌를 바로 노출(별도 페이지 없이)
  let payoutAccount: Awaited<ReturnType<typeof getPayoutAccountForBooking>> = null;
  if (isBuyer && b.status === "accepted") {
    await ensureTransferRecord(id, b.amount_krw ?? 0); // 송금 대기 결제 레코드 보장(멱등)
    payoutAccount = await getPayoutAccountForBooking(id);
  }

  // 뒤로가기 — 채팅에서 들어왔으면 채팅방으로, 아니면 예약 목록으로
  const back =
    from === "chat" && convId
      ? { href: `/chat/${convId}`, label: "← 채팅" }
      : { href: "/bookings", label: "← 예약" };

  // 정체 단계 넛지 (경량 인앱 리마인더)
  const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  let nudge: string | null = null;
  if (b.status === "accepted") {
    const d = b.accepted_at ? daysSince(b.accepted_at) : 0;
    const tail = d > 0 ? ` · ${d}일째` : "";
    nudge = isBuyer
      ? `송금 대기 중${tail} — 작가 계좌로 직접 송금 후 입금 확인을 기다려주세요.`
      : `고객 송금 대기 중${tail} — 입금되면 '입금 확인'을 눌러주세요.`;
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
    <main className="mx-auto max-w-lg px-4 sm:px-6 py-8 font-kr">
      <Link href={back.href} className="text-sm text-fg/50 hover:text-fg">
        {back.label}
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">예약 상세</h1>
        <span className={`rounded-full px-2.5 py-1 text-xs ${statusTone(b.status)}`}>
          {STATUS_LABEL[b.status]}
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
        <Row label="일시" value={fmtShootAt(b.shoot_at)} />
        <Row label="장소" value={b.location_text || "—"} />
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
        <p className="mt-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
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

        {/* 구매자: 수락됨 → 송금 안내(작가 계좌·금액·송금완료) 인라인 노출 (req4) */}
        {isBuyer && b.status === "accepted" && (
          <section className="rounded-xl border border-fg/12 bg-surface p-5">
            <p className="text-sm font-semibold">💸 송금 안내</p>
            <p className="mt-1 text-xs text-fg/55">
              아래 계좌로 촬영비를 직접 송금해주세요. 작가가 입금을 확인하면 결제가 완료됩니다.
            </p>

            {payoutAccount ? (
              <div className="mt-3 rounded-xl bg-fg/[0.04] p-3 text-sm">
                <Row label="은행" value={payoutAccount.bank} />
                <Row label="계좌번호" value={payoutAccount.number} />
                <Row label="예금주" value={payoutAccount.holder} />
                <div className="mt-2 flex items-center justify-between border-t border-fg/10 pt-2">
                  <span className="text-fg/50">보낼 금액</span>
                  <span className="text-base font-bold">₩{fmt.format(b.amount_krw ?? 0)}</span>
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
                작가가 아직 수취 계좌를 등록하지 않았어요. 채팅으로 계좌를 문의해주세요.
              </p>
            )}

            {b.transfer_marked_at ? (
              <p className="mt-3 rounded-full bg-success-soft px-3 py-2 text-center text-xs text-success">
                ✅ 송금 완료를 알렸어요 · 작가의 입금 확인을 기다리는 중
              </p>
            ) : (
              payoutAccount && (
                <form action={markTransferSent} className="mt-3">
                  <input type="hidden" name="id" value={b.id} />
                  <button className="w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90">
                    송금 완료
                  </button>
                </form>
              )
            )}

            <p className="mt-3 text-[11px] text-fg/45">
              · 받는 분 통장에 <b>예약자 본인 이름</b>으로 보내면 작가가 확인하기 쉬워요.<br />
              · 플랫폼은 결제를 중개하지 않으며, 송금은 사용자와 작가 간 직접 거래입니다.
            </p>
          </section>
        )}

        {/* 작가: 수락됨 → 입금 확인 */}
        {isOwner && b.status === "accepted" && (
          <form action={confirmTransfer}>
            <input type="hidden" name="id" value={b.id} />
            <button className="w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90">
              입금 확인
            </button>
          </form>
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

        {/* 결제 후 환불 — 자세한 안내·신청은 환불 페이지에서 (req6) */}
        {canRefund && (
          <Link
            href={`/bookings/${b.id}/refund`}
            className="w-full rounded-xl px-4 py-2.5 text-center text-sm text-brand hover:bg-brand/[0.06]"
          >
            {isAdmin && !isBuyer ? "환불 처리 (운영자)" : "환불 요청"}
          </Link>
        )}
      </div>

      {/* 작가: 환불 신청됨 → 직접 송금 안내 (req7) */}
      {isOwner && b.status === "refunded" && (
        <section className="mt-6 rounded-xl border border-warning/30 bg-warning-soft p-5">
          <p className="text-sm font-semibold text-warning">↩️ 환불 신청이 접수됐어요</p>
          <p className="mt-1.5 text-sm text-warning/90">
            고객에게 <b>₩{fmt.format(b.amount_krw ?? 0)}</b>을(를) 직접 송금해 환불해주세요.
            계좌가 필요하면 채팅으로 문의할 수 있어요.
          </p>
          {convId && (
            <Link
              href={`/chat/${convId}`}
              className="mt-3 inline-block rounded-full bg-fg px-4 py-2 text-xs font-semibold text-bg hover:opacity-90"
            >
              채팅으로 계좌 확인하기
            </Link>
          )}
        </section>
      )}

      {/* 보정본 갤러리 — 완료된 예약 (참여자) · 그리드+라이트박스+저장 (req10,11) */}
      {b.status === "completed" && (downloads.length > 0 || delivery?.external_link) && (
        <DeliveryGallery
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
              <p className="mt-1 text-warning">{"★".repeat(review.rating)}<span className="text-fg/20">{"★".repeat(5 - review.rating)}</span></p>
              {review.body && <p className="mt-2 text-sm text-fg/70">{review.body}</p>}
            </div>
          ) : (
            <p className="text-center text-sm text-fg/40">아직 후기가 없어요.</p>
          )}
        </section>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-fg/50">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
