import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/user/icons";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "사매(samae) 개인정보 수집·이용 및 처리방침",
};

// 개인정보 처리방침 — 표준안. ※ 실제 시행 전 법무 검토 권장.
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
            서비스는 원활한 운영을 위해 클라우드 인프라·메시지 발송·분석 등 일부 업무를 외부 전문업체에
            위탁할 수 있으며, 위탁 시 관련 법령에 따라 개인정보가 안전하게 관리되도록 합니다.
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
