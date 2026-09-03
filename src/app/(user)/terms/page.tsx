import type { Metadata } from "next";
import Link from "next/link";

/*
  서비스 이용약관 — **껍데기**.

  회원가입 화면이 "서비스 이용약관"을 링크 없는 평문으로 띄우고 있었다
  (SignupForm 주석에도 "없는 데로 링크를 걸지 않는다"고 적혀 있었다).
  /terms 는 404 였다.

  ⚠️ 여기에 조항을 지어 쓰지 않는다. 약관은 법적 효력을 갖는 문서라
     확정되지 않은 문장을 올려 두면 그게 곧 회사가 한 약속이 된다.
     지금 확정된 것은 /trust · /privacy · /terms/ad-consent 세 곳에 이미 공개돼 있고,
     이 페이지는 **무엇을 다룰지와 지금 어디에 무엇이 있는지**만 알린다.

  본문은 법무 검토를 거쳐 채운다. 채우는 날 아래 STATUS 를 지우고 시행일을 박을 것.
  그때까지 robots noindex — 미완성 약관이 검색에 잡히면 그 자체가 사고다.
*/

export const metadata: Metadata = {
  title: "서비스 이용약관",
  description: "사매(samae) 서비스 이용약관 — 준비 중. 확정된 기준은 안전 안내와 개인정보 처리방침에 있습니다.",
  alternates: { canonical: "/terms" },
  robots: { index: false, follow: true },
};

/** 본문이 들어오면 이 줄을 지운다 (아래 안내 박스도 함께). */
const STATUS = "준비 중";

/** 조문 뼈대 — 실제 서비스가 하는 일에 맞춘 목차. 문구가 아니라 범위만 적는다. */
const OUTLINE: Array<{ no: string; title: string; scope: string }> = [
  { no: "01", title: "목적과 용어", scope: "사매가 제공하는 서비스의 범위, 회원·작가·촬영·예약의 정의" },
  { no: "02", title: "사매의 지위", scope: "사매가 촬영 당사자인지 중개자인지, 그에 따른 책임의 범위" },
  { no: "03", title: "계정", scope: "가입과 탈퇴, 계정 이용 제한, 작가 등록 심사" },
  { no: "04", title: "예약과 결제", scope: "예약이 확정되는 시점, 결제 방식, 중개 수수료" },
  { no: "05", title: "취소와 환불", scope: "취소 시점별 환불 비율, 작가 귀책·기상 등 예외" },
  { no: "06", title: "결과물과 저작권", scope: "촬영 결과물의 권리, 사매 지면·홍보 사용 범위" },
  { no: "07", title: "금지 행위", scope: "외부 채널 유도, 개인 계좌 직거래, 허위 정보" },
  { no: "08", title: "분쟁 해결", scope: "이의 제기 절차, 준거법과 관할" },
];

/** 지금 실제로 공개돼 있고 서비스가 그대로 운영되는 문서들. */
const PUBLISHED = [
  { href: "/privacy", label: "개인정보 처리방침", desc: "수집 항목 · 보관과 파기" },
  { href: "/terms/ad-consent", label: "광고 소재 사용 동의", desc: "작가 포트폴리오의 홍보 사용 범위" },
];

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 font-kr">
      <h1 className="text-2xl font-bold tracking-tight">서비스 이용약관</h1>
      <p className="mt-2 text-sm text-muted">{STATUS}</p>

      {/* 없는 약관을 있는 것처럼 보이게 하지 않는다. 대신 지금 무엇이 유효한지 바로 말한다. */}
      <div className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
        <p className="text-sm leading-relaxed text-fg/80">
          전문(全文)을 준비하고 있습니다. 그전까지 사매가 실제로 지키는 기준은 아래 문서에
          적힌 그대로이며, 촬영·결제·환불은 모두 그 기준으로 처리됩니다.
        </p>
      </div>

      <nav aria-label="공개된 기준" className="mt-4 border-t border-line">
        {PUBLISHED.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="group flex items-baseline justify-between gap-4 border-b border-line py-3.5"
          >
            <span className="shrink-0 text-sm font-bold tracking-tight transition-colors group-hover:text-brand">
              {p.label}
            </span>
            <span className="min-w-0 truncate text-xs text-faint">{p.desc}</span>
          </Link>
        ))}
      </nav>

      <section className="mt-12">
        <h2 className="text-base font-semibold">약관이 다룰 내용</h2>
        <p className="mt-1.5 text-sm text-muted">
          아래 여덟 항목으로 정리해 공지 후 시행합니다.
        </p>
        <ol className="mt-5 space-y-4">
          {OUTLINE.map((o) => (
            <li key={o.no} className="flex gap-3.5">
              <span className="w-6 shrink-0 font-display text-xs italic tabular-nums text-brand">
                {o.no}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold tracking-tight">{o.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{o.scope}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-12 border-t border-line pt-5 text-xs leading-relaxed text-faint">
        약관이 시행되면 시행일 전에 공지하고, 이미 가입한 회원에게도 알립니다.
      </p>
    </main>
  );
}
