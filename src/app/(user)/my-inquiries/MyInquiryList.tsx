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
  const title = iq.purpose && iq.purpose !== "아직 고민 중이에요" ? `${iq.purpose} 문의` : "문의";
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

        <h3 className="text-body font-bold tracking-tight text-fg">{title}</h3>

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

        {/* 남긴 연락처 — 구분선으로 분리, 종류는 아이콘으로 */}
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 text-caption text-muted">남긴 연락처</p>
          <div className="space-y-2">
            {contactRows(iq).map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-body-sm leading-4 text-fg">
                <ContactIcon kind={c.kind} />
                <span className="min-w-0 break-all">{c.value}</span>
              </div>
            ))}
          </div>
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

type ContactKind = "phone" | "instagram" | "kakao" | "etc";

function contactRows(iq: MyInquiry): { kind: ContactKind; value: string }[] {
  const rows: { kind: ContactKind; value: string }[] = [];
  if (iq.phone) rows.push({ kind: "phone", value: iq.phone });
  if (iq.instagram) rows.push({ kind: "instagram", value: iq.instagram });
  if (iq.kakao) rows.push({ kind: "kakao", value: iq.kakao });
  if (iq.extraContact) rows.push({ kind: "etc", value: iq.extraContact });
  if (rows.length === 0) rows.push({ kind: "etc", value: "-" });
  return rows;
}

function ContactIcon({ kind }: { kind: ContactKind }) {
  const cls = "h-4 w-4 shrink-0 text-muted";
  if (kind === "phone")
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path
          d="M4 5c0-.6.4-1 1-1h2.3c.5 0 .9.3 1 .8l.8 3c.1.4 0 .8-.3 1.1L7.3 10.4a12 12 0 0 0 6.3 6.3l1.5-1.5c.3-.3.7-.4 1.1-.3l3 .8c.5.1.8.5.8 1V19c0 .6-.4 1-1 1A15 15 0 0 1 4 5z"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (kind === "instagram")
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="3.8" />
        <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  if (kind === "kakao")
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path
          d="M12 4.5c-4.3 0-7.8 2.6-7.8 5.9 0 2.1 1.5 4 3.6 5-.2.7-.7 2.4-.8 2.7 0 .2.2.3.4.2.3-.2 2.6-1.8 3-2.1.5.1 1 .1 1.6.1 4.3 0 7.8-2.6 7.8-5.9S16.3 4.5 12 4.5z"
          strokeLinejoin="round"
        />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M4 7l8 5.5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
