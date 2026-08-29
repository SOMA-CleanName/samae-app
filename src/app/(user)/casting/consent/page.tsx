import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = {
  title: "보호자 동의서",
  description: "미성년 참여자의 촬영 참여 및 초상 사용에 대한 법정대리인 동의서.",
};

// 미성년 신청자용 보호자 동의서 — 인쇄해서 서명한 뒤 사진/스캔으로 올린다.
// PDF 파일 대신 페이지로 두는 이유: 문구를 고칠 때 파일을 다시 만들 필요가 없고,
// 모바일에서 링크로 바로 열어 보호자에게 보여줄 수 있다.
//
// ⚠️ 여기 적힌 준수 사항은 마케팅이 아니라 약속이다. 운영에서 실제로 지켜야 한다.
//    (특히 "철회 시 지체 없이 삭제" — 요청이 오면 게시물을 내리는 절차가 있어야 한다)
export default function CastingConsentPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 font-kr print:max-w-none print:px-0 print:py-0">
      <div className="print:hidden">
        <Link href="/casting" className="text-sm text-fg/50 hover:text-fg">
          ← 모집 페이지로
        </Link>
        <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm font-semibold">이 문서를 인쇄해 보호자님 서명을 받아주세요</p>
          <p className="mt-1.5 text-xs leading-relaxed text-fg/60">
            서명한 문서를 사진으로 찍거나 스캔해서 신청 화면에 올려주시면 돼요.
            프린터가 없다면 화면을 보여드리고 내용에 동의하시는지 확인한 뒤,
            보호자님이 직접 이름과 날짜를 적어 서명한 종이를 찍어 올려주셔도 됩니다.
          </p>
          <PrintButton />
        </div>
      </div>

      <article className="mt-8 text-[13px] leading-relaxed text-fg print:mt-0">
        <h1 className="text-center text-xl font-bold">촬영 참여 및 초상 사용 동의서</h1>
        <p className="mt-2 text-center text-xs text-fg/55">
          samae(사매) 무료 모델 촬영 · 법정대리인 동의서
        </p>

        <Section title="1. 참여자">
          <Row label="성명" />
          <Row label="생년월일" hint="(만      세)" />
          <Row label="연락처" />
        </Section>

        <Section title="2. 법정대리인(보호자)">
          <Row label="성명" />
          <Row label="참여자와의 관계" />
          <Row label="연락처" />
        </Section>

        <Section title="3. 촬영 개요">
          <ul className="ml-4 list-disc space-y-1">
            <li>주관: samae(사매) — 과학기술정보통신부 SW마에스트로 17기 프로젝트</li>
            <li>내용: 야외 스냅 촬영 (일상복 · 자연광)</li>
            <li>시간: 1회 3시간 이내 · <b>일몰 전 종료</b></li>
            <li>비용: <b>참여자 부담 없음</b> (촬영·보정 전액 주관 측 부담)</li>
            <li>결과물: 촬영 원본 및 보정본 <b>전량 무상 제공</b>, 참여자의 사용에 제한을 두지 않음</li>
          </ul>
          <Row label="촬영 예정일" />
          <Row label="촬영 장소" />
        </Section>

        <Section title="4. 동의 항목">
          <p className="mb-2 text-xs text-fg/60">
            각 항목에 개별적으로 표시해 주십시오. <b>2·3·4번에 동의하지 않으셔도 촬영 참여는 가능합니다.</b>
          </p>
          <Consent
            n="1"
            required
            title="촬영 참여 동의"
            body="위 참여자가 본 촬영에 모델로 참여하는 것에 동의합니다."
          />
          <Consent
            n="2"
            title="SNS 게시 동의"
            body="촬영 결과물을 samae 공식 SNS 계정 및 서비스 소개 자료에 게시하는 것에 동의합니다."
          />
          <Consent
            n="3"
            title="유료 광고 사용 동의"
            body="촬영 결과물을 samae의 유료 광고 소재로 사용하는 것에 동의합니다."
          />
          <Consent
            n="4"
            title="모델 크레딧 표기 동의"
            body="게시물에 참여자의 성명을 모델 크레딧으로 표기하는 것에 동의합니다. (예명 표기 희망 시 기재: ______________)"
          />
        </Section>

        <Section title="5. 주관 측이 준수할 사항">
          <p className="mb-2 text-xs text-fg/60">아래를 위반하는 경우 본 동의는 즉시 효력을 잃습니다.</p>
          <ol className="ml-4 list-decimal space-y-1.5">
            <li>
              <b>노출·선정적 콘셉트를 일절 촬영하지 않습니다.</b> 수영복·속옷, 신체 특정 부위를 강조하는
              구도를 포함하며, 참여자 본인이나 보호자의 요청이 있더라도 촬영하지 않습니다.
            </li>
            <li><b>야간(일몰 이후) 촬영을 하지 않습니다.</b></li>
            <li><b>평일 수업시간 중 촬영을 하지 않습니다.</b></li>
            <li>촬영 현장에 <b>주관 측 운영진이 1인 이상 상주</b>하며, 참여자가 성인 1인과 단독으로 있게 하지 않습니다.</li>
            <li><b>법정대리인의 현장 동행을 사전 통보 없이도 허용</b>합니다.</li>
            <li>참여자가 원하지 않는 촬영은 <b>사유를 묻지 않고 즉시 중단</b>합니다.</li>
            <li>결과물을 <b>제3자에게 판매·양도하지 않습니다.</b></li>
            <li>사용 범위를 <b>samae 공식 SNS 및 서비스 소개 자료로 한정</b>합니다.</li>
            <li>개인정보는 본 촬영 진행 목적으로만 사용하고, <b>종료 후 파기</b>합니다.</li>
          </ol>
        </Section>

        <Section title="6. 동의 철회">
          <p>
            법정대리인 또는 참여자 본인은 <b>언제든지 사유 없이 동의를 철회</b>할 수 있습니다.
            철회 의사를 전달받은 주관 측은 해당 게시물을 <b>지체 없이 삭제</b>하고 이후 사용을 중단합니다.
            철회에 기한 제한은 없습니다.
          </p>
          <Row label="철회 연락처" hint="(주관 측 기재)" />
        </Section>

        <p className="mt-8">
          위 내용을 충분히 읽고 이해하였으며, 표시한 항목에 대하여 동의합니다.
        </p>

        <div className="mt-8 space-y-6">
          <p className="text-center">20____년 ______월 ______일</p>
          <div className="flex justify-end gap-10 pr-2">
            <SignLine label="참여자" />
            <SignLine label="법정대리인" />
          </div>
        </div>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 break-inside-avoid">
      <h2 className="border-b border-fg/25 pb-1.5 text-sm font-bold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mt-2.5 flex items-end gap-3">
      <span className="w-32 shrink-0 text-xs text-fg/60">{label}</span>
      <span className="flex-1 border-b border-fg/25 pb-1">&nbsp;</span>
      {hint && <span className="shrink-0 text-xs text-fg/45">{hint}</span>}
    </div>
  );
}

function Consent({ n, title, body, required }: { n: string; title: string; body: string; required?: boolean }) {
  return (
    <div className="mt-3 break-inside-avoid rounded border border-fg/20 p-3">
      <p className="text-[13px] font-semibold">
        {n}. {title}{" "}
        <span className="text-xs font-normal text-fg/50">{required ? "(필수)" : "(선택)"}</span>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-fg/70">{body}</p>
      <p className="mt-2 text-xs">☐ 동의함　　☐ 동의하지 않음</p>
    </div>
  );
}

function SignLine({ label }: { label: string }) {
  return (
    <div className="text-center">
      <span className="text-xs text-fg/60">{label}</span>
      <div className="mt-1 w-36 border-b border-fg/35 pb-6" />
      <span className="mt-1 block text-[10px] text-fg/40">(서명)</span>
    </div>
  );
}
