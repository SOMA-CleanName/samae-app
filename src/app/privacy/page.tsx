import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/user/icons";
import { BUSINESS_INFO } from "@/lib/business-info";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "사매(samae) 개인정보 수집·이용 및 처리방침",
  // 없으면 루트 layout 의 canonical:"/" 를 상속해 홈의 복제본으로 신고된다
  alternates: { canonical: "/privacy" },
};

/*
  개인정보 처리방침.

  ⚠️ **이 파일은 코드가 아니라 법정 게시물이다.** 개인정보보호법 제30조가 요구하는 항목이
     정해져 있고, 여기 적힌 문장은 회사가 한 약속이 된다. 그래서 두 가지를 지킨다 —

     1) **코드가 실제로 하는 것만 적는다.** 아래 항목은 전부 실물에서 확인해 만들었다.
        수집 항목은 profiles·inquiries·analytics_events·persona_results 컬럼,
        수탁자는 lib/supabase·lib/mixpanel·sentry.*.config·lib/ops-alert·api/track,
        보관기간은 persona/store 의 TTL_HOURS, 파기는 lib/soft-delete.
        기능을 붙이거나 떼면 **여기도 같이 고쳐야 한다.**
     2) **모르는 것을 지어내지 않는다.** 확인이 안 된 항목은 아래 미확정 목록에 남긴다.

  🔴 미확정 (법무·운영 확인 후 채울 것)
     · Supabase 데이터베이스의 **물리적 리전**. 아래 국외이전 표는 "법인 소재지" 기준으로
       적었다(6곳 모두 미국 법인). 저장 위치가 국내라면 그 사실을 별도로 적는 편이 정확하다.
       Supabase 대시보드 → Settings → General → Region 에서 확인.
     · **만 14세 미만 아동** 조항. 서비스에 연령 게이트가 없어서 "가입을 받지 않습니다"라고
       쓸 수 없다. 게이트를 만들든가, 처리 실태를 확인해 사실대로 적든가 둘 중 하나다.
     · 개인정보 보호책임자의 **전화번호**. 사업용 회선 개통 후 추가(현재는 이메일로 충족).
*/

/**
 * 수집 항목 — profiles · inquiries · analytics_events · persona_results 실물 기준.
 *
 * ⚠️ 페르소나 항목은 처음에 "인스타그램 아이디(해시)" 까지만 적었다가 보강했다.
 *    실제로는 `persona/lookup.ts` 가 **공개 프로필의 게시물 이미지를 조회해 임베딩**한다.
 *    이미지 원본은 남지 않지만(벡터만 `persona_results.embedding`), 무엇을 가져오는지를
 *    적지 않으면 실제 처리를 축소 서술하는 것이 된다.
 */
const COLLECTED = [
  {
    when: "회원가입·계정",
    items:
      "이름 또는 표시명, 이메일, 전화번호, 프로필 이미지, 카카오 로그인 시 카카오 계정 식별정보",
  },
  {
    when: "촬영 문의",
    items:
      "이름, 연락처(전화번호·카카오톡 ID·이메일), 촬영 목적, 희망 일시, 희망 지역, 인원, 성별, 요청 사항, 첨부한 참고 이미지",
  },
  {
    when: "작가 등록",
    items: "표시명, 소개, 연락 수단, 활동 지역, 포트폴리오 사진",
  },
  {
    when: "촬영 페르소나(선택 기능)",
    items:
      "인스타그램 아이디(원문을 저장하지 않고 해시값으로만 보관), 접속 IP(해시값), 분석 결과. " +
      "이용자가 입력한 계정의 공개 게시물 이미지를 조회해 자동으로 특징값(벡터)으로 변환하며, " +
      "이미지 원본은 저장하지 않습니다.",
  },
  {
    when: "자동 수집",
    items:
      "서비스 이용 기록, 접속 로그, 기기·브라우저 정보, 쿠키, 유입 경로(UTM 등 광고 식별자)",
  },
];

/** 이용 목적. */
const PURPOSES = [
  "이용자와 사진작가 간 촬영 상담·예약 연결 및 매칭",
  "이용자가 선택한 경우, 취향 분석과 사진 추천(자동화된 분석이 사용됩니다)",
  "문의 응대, 본인 확인, 서비스 제공 및 운영",
  "요금 정산, 취소·환불 처리 및 분쟁 대응",
  "서비스 개선, 통계 분석, 부정 이용 방지",
];

/**
 * 보유 기간 — **코드가 실제로 하는 것만 적는다.**
 *
 * 🔴 초안에 "접속 로그는 수집일로부터 1년" 이라고 썼다가 지웠다. 그렇게 지우는 코드가
 *    없다(analytics_events 는 어드민이 수동 초기화할 때만 삭제된다). 지키지 않는 기간을
 *    적으면 그 자체가 거짓 고지이고, 규제기관이 보는 건 방침이 아니라 실제 처리 실태다.
 *
 * 🔴 페르소나도 마찬가지다. `expires_at` 이 지나면 **조회에서 빠질 뿐 행은 남는다**
 *    (persona/store 는 `.gt("expires_at", now)` 필터만 건다). 그래서 "만료되어 이용하지
 *    않는다" 까지만 적었다.
 *
 * ⏭️ 다음에 할 일 — 만료 데이터를 실제로 지우는 정리 작업(api/cron 에 추가). 그게 붙으면
 *    여기 기간을 숫자로 못박을 수 있고, 그때가 방침이 강해지는 시점이다.
 */
const RETENTION = [
  { what: "회원 정보", how: "회원 탈퇴 시까지" },
  { what: "촬영 문의·예약 기록", how: "거래 종료 후 관계 법령이 정한 기간" },
  {
    what: "촬영 페르소나 분석 결과",
    how: "생성 후 72시간이 지나면 만료되어 더 이상 이용하지 않습니다",
  },
  {
    what: "서비스 이용 기록·접속 로그",
    how: "통계 분석과 부정 이용 방지 목적이 유지되는 동안",
  },
];

/**
 * 개인정보 처리 수탁자.
 *
 * 개인정보보호법 제26조 제2항 — 위탁 업무의 내용과 수탁자를 공개해야 한다.
 * ⚠️ 코드에서 실사용을 확인한 것만 적는다. 쓰지 않는 업체를 적는 것도 거짓 고지다.
 *    PG 를 붙이면 결제대행사가, 알림톡을 켜면 발송 대행사(솔라피)가 여기 추가된다.
 *    **dev 개정안 전문은 `docs/39-privacy-dev-amendment.md` 에 써 뒀다** —
 *    §3(제3자 제공) 전면 재작성 · 채팅/결제 수집 항목 신설 · 수탁자 추가 · 보유기간.
 *    새 모델은 작가에게 연락처를 제공하지 않으므로 지금 §3 문장이 그대로 거짓이 된다.
 */
const PROCESSORS = [
  { name: "Supabase, Inc.", work: "데이터베이스·회원 인증·이미지 저장", country: "미국" },
  { name: "Vercel, Inc.", work: "서비스 호스팅 및 서버 운영", country: "미국" },
  { name: "Mixpanel, Inc.", work: "서비스 이용 행태 분석", country: "미국" },
  { name: "Functional Software, Inc. (Sentry)", work: "오류 수집 및 안정성 모니터링", country: "미국" },
  { name: "Discord Inc.", work: "운영자 알림(새 문의·작가 신청) 전달", country: "미국" },
  { name: "Google LLC", work: "주요 이용 기록 집계", country: "미국" },
];

/** 개인정보 보호책임자 — 법 제31조. 성명·직책·연락처가 반드시 표시되어야 한다. */
const DPO = {
  name: BUSINESS_INFO.ceo,
  role: "대표",
  email: BUSINESS_INFO.email,
};

/** 개정 이력 — 방침이 바뀌면 시행일과 함께 여기 한 줄 추가한다. */
const EFFECTIVE_DATE = "2026-06-26";

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
        {BUSINESS_INFO.name}(이하 &ldquo;서비스&rdquo;)는 「개인정보 보호법」 등 관련 법령을 준수하며,
        이용자의 개인정보를 어떤 목적으로 수집·이용하고 어떻게 보호하는지 아래와 같이 알려드립니다.
      </p>

      <div className="mt-8 space-y-7 text-sm leading-relaxed text-fg/85">
        <Section title="1. 수집하는 개인정보 항목">
          <dl className="space-y-2">
            {COLLECTED.map((c) => (
              <div key={c.when}>
                <dt className="font-semibold text-fg">{c.when}</dt>
                <dd className="text-fg/80">{c.items}</dd>
              </div>
            ))}
          </dl>
          {/*
            ⚠️ 예전 문장은 "이용자가 직접 입력한 정보만 수집한다" 였다. 페르소나가 인스타그램
               공개 게시물을 조회하므로 **직접 입력이 아닌 수집이 존재한다.** 그 상태로 두면
               방침이 실제 처리를 부인하는 꼴이 된다.
          */}
          <p className="mt-2 text-muted">
            위 항목 외의 정보는 수집하지 않습니다. 촬영 페르소나의 경우 이용자가 계정을 직접
            입력해 분석을 요청한 범위에서만 공개된 정보를 조회합니다.
          </p>
        </Section>

        <Section title="2. 개인정보의 수집·이용 목적">
          <ul className="list-disc space-y-1 pl-5">
            {PURPOSES.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Section>

        <Section title="3. 개인정보의 제3자 제공">
          <p>
            서비스는 이용자의 촬영 상담·예약 연결을 위해, 이용자가 선택한(또는 매칭된)
            사진작가에게 상담 정보와 연락처를 제공합니다. 제공받는 자는 해당 사진작가이며,
            제공 목적은 촬영 상담·예약 진행에 한정되고, 그 목적이 끝나면 사진작가는 제공받은
            정보를 이용할 수 없습니다.
          </p>
          <p className="mt-2">
            이 외의 목적으로는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 다만
            법령에 따라 수사기관 등이 적법한 절차로 요구하는 경우에는 관련 법령이 정한 범위에서
            제공할 수 있습니다.
          </p>
        </Section>

        <Section title="4. 개인정보 처리의 위탁">
          <p>
            서비스는 원활한 운영을 위해 아래와 같이 개인정보 처리 업무를 위탁하고 있으며, 위탁
            계약 시 개인정보가 안전하게 관리되도록 관련 법령에 따라 필요한 사항을 규정하고 있습니다.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {PROCESSORS.map((p) => (
              <li key={p.name}>
                <b className="font-semibold text-fg">{p.name}</b> — {p.work}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted">
            위탁 업무의 내용이나 수탁자가 변경될 경우 본 방침을 통해 공개합니다.
          </p>
        </Section>

        <Section title="5. 개인정보의 국외 이전">
          <p>
            위 수탁자는 모두 국외에 소재한 사업자로, 서비스 제공을 위해 개인정보가 국외로
            이전됩니다. 이전은 서비스 이용 계약의 이행에 필요한 범위에서 서비스 이용 시점에
            정보통신망을 통해 이루어집니다.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {PROCESSORS.map((p) => (
              <li key={p.name}>
                <b className="font-semibold text-fg">{p.name}</b> ({p.country}) — {p.work} · 이전
                항목: 위 1항의 수집 항목 중 해당 업무에 필요한 정보 · 보유 기간: 위탁 계약 종료 시까지
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted">
            이용자는 국외 이전을 거부할 수 있으나, 이 경우 서비스 이용이 제한될 수 있습니다.
            거부 의사는 아래 8항의 보호책임자에게 알려주시기 바랍니다.
          </p>
        </Section>

        <Section title="6. 개인정보의 보유 및 이용 기간">
          <dl className="space-y-1">
            {RETENTION.map((r) => (
              <div key={r.what} className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-fg">{r.what}</dt>
                <dd className="text-fg/80">— {r.how}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2">
            보유 기간이 지나거나 처리 목적이 달성되면 지체 없이 파기합니다. 다만 「전자상거래
            등에서의 소비자보호에 관한 법률」 등 관계 법령이 일정 기간 보존을 요구하는 경우에는
            그 기간 동안 보관합니다.
          </p>
        </Section>

        <Section title="7. 개인정보의 파기 절차 및 방법">
          <p>
            파기 사유가 발생한 개인정보는 접근 권한이 제한된 별도의 보관 영역으로 옮긴 뒤
            운영 데이터베이스에서 삭제합니다. 전자적 파일은 복구할 수 없는 방법으로 삭제하고,
            출력물이 있는 경우 분쇄하거나 소각합니다.
          </p>
          <p className="mt-2">
            회원 탈퇴를 요청하면 계정과 이에 연결된 개인정보가 위 절차에 따라 삭제됩니다. 다만
            진행 중인 거래가 있는 경우 그 거래가 끝난 뒤에 처리됩니다.
          </p>
        </Section>

        <Section title="8. 개인정보 보호책임자">
          <p>
            서비스는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한
            이용자의 문의·불만·피해 구제 등을 처리하기 위하여 아래와 같이 개인정보 보호책임자를
            지정하고 있습니다.
          </p>
          <dl className="mt-2 space-y-1">
            <Row label="성명" value={DPO.name} />
            <Row label="직책" value={DPO.role} />
            <Row label="연락처" value={DPO.email} />
          </dl>
          <p className="mt-2 text-muted">
            개인정보 열람·정정·삭제·처리정지 청구도 위 연락처로 접수하며, 서비스는 지체 없이
            필요한 조치를 취합니다.
          </p>
        </Section>

        <Section title="9. 정보주체의 권리와 행사 방법">
          <p>
            이용자는 언제든지 자신의 개인정보에 대해 열람·정정·삭제·처리정지를 요청할 수 있고,
            동의를 철회할 수 있습니다. 계정 설정 화면에서 직접 정보를 수정하거나 회원 탈퇴를
            할 수 있으며, 위 8항의 연락처로도 요청할 수 있습니다.
          </p>
          <p className="mt-2">
            권리 행사를 이유로 이용자에게 불이익을 주지 않습니다. 다만 법령이 보존을 요구하는
            정보는 삭제 요청이 있어도 해당 기간 동안 보관될 수 있습니다.
          </p>
        </Section>

        <Section title="10. 개인정보의 안전성 확보 조치">
          <p>
            서비스는 개인정보의 안전한 처리를 위해 접근 권한 관리, 전송 구간 암호화(HTTPS),
            비밀번호 등 인증 정보의 암호화 저장, 접속 기록 보관, 외부 침입 차단 조치를 하고
            있습니다. 촬영 페르소나 기능의 인스타그램 아이디와 접속 IP 는 원문을 저장하지 않고
            복원할 수 없는 해시값으로만 보관합니다.
          </p>
        </Section>

        <Section title="11. 쿠키 등 자동 수집 장치">
          <p>
            서비스는 이용 편의와 이용 행태 분석을 위해 쿠키 등 자동 수집 장치를 사용합니다.
            이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 이 경우 로그인 유지 등
            일부 기능 이용이 제한될 수 있습니다.
          </p>
        </Section>

        <Section title="12. 권익 침해에 대한 구제 방법">
          <p>
            개인정보 침해로 인한 피해를 구제받고자 하는 경우 아래 기관에 분쟁 해결이나 상담을
            신청할 수 있습니다.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>개인정보 침해신고센터 — 국번 없이 118 · privacy.kisa.or.kr</li>
            <li>개인정보 분쟁조정위원회 — 1833-6972 · kopico.go.kr</li>
            <li>대검찰청 사이버수사과 — 국번 없이 1301 · spo.go.kr</li>
            <li>경찰청 사이버수사국 — 국번 없이 182 · ecrm.police.go.kr</li>
          </ul>
        </Section>

        <Section title="13. 처리방침의 변경">
          <p>
            법령이나 서비스 내용의 변경에 따라 본 방침이 개정될 수 있으며, 개정 시 변경 사항과
            시행일을 이 지면에 공개합니다. 이용자에게 불리한 변경의 경우 시행일 전에 미리
            알려드립니다.
          </p>
        </Section>
      </div>

      {/*
        ⚠️ 방침 내용이 바뀌면 **머지·배포하는 날짜로 시행일을 고칠 것.** 미리 박아 두면
           배포일과 어긋나고, 방침이 언제부터 유효했는지가 분쟁 때 그대로 쟁점이 된다.
      */}
      <p className="mt-10 text-xs text-faint">
        시행일: {EFFECTIVE_DATE} · 본 방침은 관련 법령 및 서비스 변경에 따라 개정될 수 있습니다.
      </p>

      <SiteFooter />
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

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="shrink-0 font-semibold text-fg">{label}</dt>
      <dd className="text-fg/80">{value}</dd>
    </div>
  );
}
