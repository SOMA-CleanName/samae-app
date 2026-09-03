import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/user/icons";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "사매(samae) 개인정보 수집·이용 및 처리방침",
};

// 개인정보 처리방침 — 표준안. ※ 실제 시행 전 법무 검토 권장.

/**
 * 개인정보 처리 수탁자.
 *
 * 「개인정보 보호법」 제26조 제2항은 위탁 시 **위탁하는 업무의 내용과 수탁자를 공개**하도록
 * 한다. 그전까지 이 자리는 "클라우드 인프라·메시지 발송·분석 등 일부 업무를 외부 전문업체에"
 * 라고만 적혀 있었다 — 수탁자를 안 밝히면 그 자체로 조항 위반이다.
 *
 * ⚠️ **코드에서 실제로 쓰는 것만 적는다.** 쓰지 않는 업체를 적어 두면 그것도 거짓 고지다.
 *    아래 목록은 이 브랜치의 실사용을 확인해 만들었다. 붙이거나 뗄 때 같이 고칠 것 —
 *      · Supabase  lib/supabase/*        · Vercel    배포 플랫폼
 *      · Mixpanel  lib/mixpanel*         · Sentry    sentry.*.config.ts
 *      · Discord   lib/ops-alert(문의·작가 신청 알림에 고객 이름이 실린다)
 *      · Google    api/track → SHEETS_WEBHOOK_URL (페이지뷰·CTA 클릭 집계)
 *    PG 를 붙이면 결제대행사가, 알림톡을 켜면 발송 대행사(솔라피)가 여기 추가된다.
 *
 * 🔴 남은 것 — **국외 이전 고지(제28조의8)**. 위 수탁자는 대부분 해외 사업자이고,
 *    법은 이전받는 자·국가·시기·방법·항목·목적·보유기간을 따로 알리도록 한다.
 *    조항을 지어 쓰지 않고 법무 검토 후 채운다(docs 의 약관 검토 항목과 같이 처리).
 */
const PROCESSORS = [
  { name: "Supabase", work: "데이터베이스·회원 인증·이미지 저장" },
  { name: "Vercel", work: "서비스 호스팅 및 서버 운영" },
  { name: "Mixpanel", work: "서비스 이용 행태 분석" },
  { name: "Sentry", work: "오류 수집 및 서비스 안정성 모니터링" },
  { name: "Discord", work: "운영자 알림(새 문의·작가 신청) 전달" },
  { name: "Google", work: "주요 이용 기록 집계" },
];
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 font-kr">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        <ArrowLeftIcon className="h-4 w-4" /> 홈으로
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">개인정보 처리방침</h1>
      <p className="mt-2 text-sm text-muted">
        사매(이하 &ldquo;서비스&rdquo;)는 이용자의 개인정보를 중요하게 생각하며, 「개인정보 보호법」 등 관련
        법령을 준수합니다. 본 방침은 서비스가 어떤 정보를 어떤 목적으로 수집·이용하는지 안내합니다.
      </p>

      <div className="mt-8 space-y-7 text-sm leading-relaxed text-fg/85">
        <Section title="1. 수집하는 개인정보 항목">
          <ul className="list-disc space-y-1 pl-5">
            <li>연락처: 전화번호, 카카오톡 ID, 인스타그램 ID, 이메일 등 이용자가 입력한 연락 수단</li>
            <li>상담 정보: 촬영 목적, 희망 일정, 희망 지역, 인원, 요청 사항 등 문의 시 입력한 내용</li>
            <li>자동 수집: 서비스 이용 기록, 접속 로그, 기기·브라우저 정보, 쿠키</li>
          </ul>
        </Section>

        <Section title="2. 개인정보의 수집·이용 목적">
          <ul className="list-disc space-y-1 pl-5">
            <li>이용자와 사진작가 간 상담·예약 연결 및 매칭</li>
            <li>문의 응대, 본인 확인, 서비스 제공 및 운영</li>
            <li>서비스 개선, 통계 분석, 부정 이용 방지</li>
          </ul>
        </Section>

        <Section title="3. 개인정보의 제3자 제공">
          <p>
            서비스는 이용자의 상담·예약 연결을 위해, 이용자가 선택한(또는 매칭된) 사진작가에게 연락처 및
            상담 정보를 제공할 수 있습니다. 제공받는 자는 해당 사진작가이며, 제공 목적은 촬영 상담·예약 진행에
            한정됩니다. 이 외의 목적으로는 동의 없이 제3자에게 제공하지 않습니다.
          </p>
        </Section>

        <Section title="4. 개인정보의 보유 및 이용 기간">
          <p>
            수집한 개인정보는 수집·이용 목적이 달성되면 지체 없이 파기합니다. 다만 관련 법령에 따라 보존이
            필요한 경우 해당 기간 동안 보관합니다. 이용자는 언제든지 개인정보의 삭제를 요청할 수 있습니다.
          </p>
        </Section>

        <Section title="5. 개인정보 처리의 위탁">
          <p>
            서비스는 원활한 운영을 위해 아래와 같이 개인정보 처리 업무를 위탁하고 있으며, 위탁 시
            관련 법령에 따라 개인정보가 안전하게 관리되도록 합니다.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {PROCESSORS.map((p) => (
              <li key={p.name}>
                <b className="font-semibold text-fg">{p.name}</b> — {p.work}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            위탁 업무의 내용이나 수탁자가 변경될 경우 본 방침을 통해 공개합니다.
          </p>
        </Section>

        <Section title="6. 이용자의 권리">
          <p>
            이용자는 자신의 개인정보에 대해 열람·정정·삭제·처리정지를 요청할 수 있습니다. 요청은 아래 문의처를
            통해 접수할 수 있으며, 서비스는 지체 없이 필요한 조치를 취합니다.
          </p>
        </Section>

        <Section title="7. 쿠키 등 자동 수집 장치">
          <p>
            서비스는 이용 편의 및 분석을 위해 쿠키 등 자동 수집 장치를 사용할 수 있습니다. 이용자는 브라우저
            설정을 통해 쿠키 저장을 거부할 수 있으나, 이 경우 일부 기능 이용이 제한될 수 있습니다.
          </p>
        </Section>

        <Section title="8. 문의처">
          <p>
            개인정보 관련 문의는 서비스 내 채팅 또는 운영 채널을 통해 접수할 수 있습니다.
          </p>
        </Section>
      </div>

      {/*
        ⚠️ 5조(위탁)에 수탁자를 명시하면서 방침 내용이 바뀌었다. **머지·배포하는 날짜로
           시행일을 고칠 것.** 지금 날짜를 박아 두면 배포일과 어긋나고, 방침이 언제부터
           유효했는지가 분쟁 때 그대로 쟁점이 된다. (수탁자 공개는 이용자에게 불리한
           변경이 아니라 사전 유예 없이 시행 가능하다)
      */}
      <p className="mt-10 text-xs text-faint">시행일: 2026-06-26 · 본 방침은 관련 법령 및 서비스 변경에 따라 개정될 수 있습니다.</p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}
