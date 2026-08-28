/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { inquiryStatusLabel, type MyInquiry } from "@/lib/my-inquiries-view";
import { SupportButton } from "@/components/user/SupportButton";
import type { BookingFieldValue } from "@/lib/booking-fields";

const fmt = new Intl.NumberFormat("ko-KR");

/** 문의 카드에 붙는 예약 요약 — 페이지에서 이미 사람이 읽을 형태로 만들어 내려온다 */
export type InquiryBooking = {
  id: string;
  status: string;
  statusLabel: string;
  /** 입금을 알린 뒤 — 사매를 거쳐야 하는 구간 (사매 문의 버튼 노출 조건) */
  settled: boolean;
  packageName: string | null;
  when: string;
  location: string | null;
  memo: string | null;
  amountKrw: number;
  travelFeeKrw: number;
  customFields: BookingFieldValue[];
};

export function MyInquiryList({
  inquiries,
  roomByPhotographer = {},
  bookingByPhotographer = {},
}: {
  inquiries: MyInquiry[];
  /** 작가별 대화방 id — 있으면 '채팅방 열기'가 실제 채팅방(/chat/[id])으로 연결 */
  roomByPhotographer?: Record<string, string>;
  /** 작가별 진행 중인 예약 — 있으면 카드에 예약 내용이 함께 뜬다 */
  bookingByPhotographer?: Record<string, InquiryBooking>;
}) {
  return (
    <ul className="mt-4 space-y-3.5">
      {inquiries.map((iq) => (
        <MyInquiryItem
          key={iq.id}
          iq={iq}
          roomId={roomByPhotographer[iq.photographerId] ?? null}
          booking={bookingByPhotographer[iq.photographerId] ?? null}
        />
      ))}
    </ul>
  );
}

const TONE: Record<string, string> = {
  wait: "bg-fg/[0.06] text-muted",
  active: "bg-brand/10 text-brand",
  done: "bg-fg/[0.06] text-fg/60",
};

function MyInquiryItem({
  iq,
  roomId,
  booking,
}: {
  iq: MyInquiry;
  roomId: string | null;
  booking: InquiryBooking | null;
}) {
  const st = inquiryStatusLabel(iq.status);
  const title = iq.purpose && iq.purpose !== "아직 고민 중이에요" ? `${iq.purpose} 문의` : "문의";
  // 실제 대화방이 있으면 그 방으로(작가 답장·요약 카드 포함), 없으면 챗봇 방 재진입
  const chatHref =
    roomId != null
      ? `/chat/${roomId}`
      : `/inquiry/bot?photographerId=${encodeURIComponent(iq.photographerId)}${
          iq.photoId ? `&photoId=${encodeURIComponent(iq.photoId)}` : ""
        }`;
  return (
    <li className="overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-line">
      {/* 상단 히어로 — 문의한 사진 + 날짜/상태 오버레이 */}
      {iq.photoThumb && (
        <div className="relative h-44 w-full">
          <img
            src={iq.photoThumb}
            alt="문의한 사진"
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/15" />
          <span className="absolute right-2.5 top-2.5 rounded-full bg-black/55 px-2.5 py-1 text-caption font-medium text-white backdrop-blur">
            {st.label}
          </span>
          <div className="absolute bottom-2.5 left-3 text-caption font-semibold leading-tight text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
            <span className="block">{iq.createdDate}</span>
            <span className="block">{iq.createdTime}</span>
          </div>
        </div>
      )}

      <div className="p-3.5">
        {/* 사진이 없을 때만 본문 상단에 날짜/상태 */}
        {!iq.photoThumb && (
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="text-caption font-medium leading-tight text-muted">
              <span className="block">{iq.createdDate}</span>
              <span className="block">{iq.createdTime}</span>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-caption font-medium ${TONE[st.tone]}`}>
              {st.label}
            </span>
          </div>
        )}

        <h3 className="text-body font-bold tracking-tight text-fg">
          {iq.photographerName ? `${iq.photographerName} · ` : ""}
          {title}
        </h3>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          <Cell label="희망일" value={iq.preferredDate} />
          <Cell
            label={iq.partySize ? "지역 · 인원" : "지역"}
            value={iq.partySize ? `${iq.region} · ${iq.partySize}` : iq.region}
          />
          {iq.note ? <Cell label="메모" value={iq.note} full soft /> : null}
        </div>

        {/* 예약이 잡혔으면 그 내용이 곧 결론이다 — 문의 답변보다 아래, 참고사진보다 위.
            채팅방을 거슬러 올라가지 않아도 일시·장소·금액이 한눈에 보여야 한다 */}
        {booking && <BookingBlock b={booking} />}

        {iq.refImages.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="mb-1.5 text-caption text-muted">참고 사진</p>
            <div className="flex flex-wrap gap-1.5">
              {iq.refImages.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`참고 ${i + 1}`}
                  className="h-14 w-14 rounded-lg object-cover ring-1 ring-line"
                  loading="lazy"
                />
              ))}
            </div>
          </div>
        )}

        {/* 채팅방 재진입 — 문의가 "보내고 끝"이 아니라 이어지는 대화임을 카드에서 보여준다 */}
        <Link
          href={chatHref}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-fg py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90"
        >
          채팅방 열기
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>

        {/* 확정된 예약이 있을 때만 — 환불·날짜 변경은 예약이 있어야 성립한다.
            채팅방까지 들어가야 보이던 창구를 목록에서 바로 열어준다 */}
        {booking?.settled && (
          <SupportButton bookingId={booking.id} conversationId={roomId} variant="list" />
        )}
      </div>
    </li>
  );
}

// 확정된 예약 내용 — 채팅 카드와 같은 항목을 같은 순서로 보여준다.
// 두 화면이 다른 걸 보여주면 어느 쪽이 진짜인지 흔들린다.
function BookingBlock({ b }: { b: InquiryBooking }) {
  const shootFee = Math.max(0, b.amountKrw - b.travelFeeKrw);
  return (
    <div className="mt-3 rounded-2xl border border-line bg-bg p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption font-semibold text-muted">예약 내용</p>
        <span className="rounded-full bg-fg/[0.06] px-2.5 py-1 text-caption font-medium text-fg">
          {b.statusLabel}
        </span>
      </div>

      {b.packageName && (
        <p className="mt-2 text-body font-semibold text-fg">{b.packageName}</p>
      )}

      <dl className="mt-2 flex flex-col gap-1.5">
        <BookingRow k="일시" v={b.when} />
        {b.location && <BookingRow k="장소" v={b.location} />}
        {b.customFields.map((f) => (
          <BookingRow key={f.id} k={f.label} v={f.value} />
        ))}
        {b.memo && <BookingRow k="메모" v={b.memo} />}
      </dl>

      <div className="mt-2.5 border-t border-line pt-2.5">
        {b.travelFeeKrw > 0 && (
          <div className="flex items-center justify-between text-caption text-muted">
            <span>촬영비 ₩{fmt.format(shootFee)}</span>
            <span>출장비 ₩{fmt.format(b.travelFeeKrw)}</span>
          </div>
        )}
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-caption text-muted">합계</span>
          <span className="text-body font-bold text-fg">₩{fmt.format(b.amountKrw)}</span>
        </div>
      </div>

      <Link
        href={`/bookings/${b.id}`}
        className="mt-3 flex w-full items-center justify-center rounded-xl border border-line-strong py-2.5 text-body-sm font-medium text-fg transition-colors hover:bg-fg/[0.04]"
      >
        예약 확인하기
      </Link>
    </div>
  );
}

function BookingRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 text-caption">
      <dt className="w-14 shrink-0 text-muted">{k}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-fg">{v}</dd>
    </div>
  );
}

function Cell({
  label,
  value,
  full,
  soft,
}: {
  label: string;
  value: string;
  full?: boolean;
  soft?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : "min-w-0"}>
      <p className="mb-0.5 text-caption text-muted">{label}</p>
      <p
        className={`whitespace-pre-wrap break-words text-body-sm text-fg ${
          soft ? "font-normal" : "font-medium"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
