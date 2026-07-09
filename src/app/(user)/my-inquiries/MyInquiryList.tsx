/* eslint-disable @next/next/no-img-element */
import { inquiryStatusLabel, type MyInquiry } from "@/lib/my-inquiries-view";

export function MyInquiryList({ inquiries }: { inquiries: MyInquiry[] }) {
  return (
    <ul className="mt-4 space-y-3.5">
      {inquiries.map((iq) => (
        <MyInquiryItem key={iq.id} iq={iq} />
      ))}
    </ul>
  );
}

const TONE: Record<string, string> = {
  wait: "bg-fg/[0.06] text-muted",
  active: "bg-brand/10 text-brand",
  done: "bg-fg/[0.06] text-fg/60",
};

function MyInquiryItem({ iq }: { iq: MyInquiry }) {
  const st = inquiryStatusLabel(iq.status);
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
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/15" />
          <span className="absolute right-2.5 top-2.5 rounded-full bg-black/55 px-2.5 py-1 text-caption font-medium text-white backdrop-blur">
            {st.label}
          </span>
          <span className="absolute bottom-2.5 left-3 text-caption font-semibold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.55)]">
            {iq.createdLabel}
          </span>
        </div>
      )}

      <div className="p-3.5">
        {/* 사진이 없을 때만 본문 상단에 날짜/상태 */}
        {!iq.photoThumb && (
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-caption font-medium text-muted">{iq.createdLabel}</span>
            <span className={`rounded-full px-2.5 py-1 text-caption font-medium ${TONE[st.tone]}`}>
              {st.label}
            </span>
          </div>
        )}

        <h3 className="text-body font-bold tracking-tight text-fg">{iq.purpose} 문의</h3>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          <Cell label="희망일" value={iq.preferredDate} />
          <Cell
            label={iq.partySize ? "지역 · 인원" : "지역"}
            value={iq.partySize ? `${iq.region} · ${iq.partySize}명` : iq.region}
          />
          {iq.note ? <Cell label="메모" value={iq.note} full soft /> : null}
        </div>

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

        {/* 남긴 연락처 — 맨 아래 별도 칸 */}
        <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5">
          <p className="text-caption text-muted">남긴 연락처</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-body-sm font-medium text-fg">
            {contactSummary(iq)}
          </p>
        </div>
      </div>
    </li>
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

function contactSummary(iq: MyInquiry): string {
  const parts: string[] = [];
  if (iq.phone) parts.push(`전화 ${iq.phone}`);
  if (iq.instagram) parts.push(`인스타 ${iq.instagram}`);
  if (iq.kakao) parts.push(`카카오 ${iq.kakao}`);
  if (iq.extraContact) parts.push(iq.extraContact);
  return parts.join(" · ") || "-";
}
