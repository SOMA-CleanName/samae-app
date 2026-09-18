import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import Link from "next/link";
import { ArrowLeftIcon } from "@/components/user/icons";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description: "사매(samae) 개인정보 수집·이용 및 처리방침",
  // 없으면 루트 layout 의 canonical:"/" 를 상속해 홈의 복제본으로 신고된다
  alternates: { canonical: "/privacy" },
};

// 개인정보 처리방침 — 표준안. ※ 실제 시행 전 법무 검토 권장.
//
// ⚠️ 개정일은 "배포되는 날" 이어야 한다. 처리방침은 게시된 시점부터 효력이 있는데,
//    아직 안 올라간 문서에 과거 날짜를 박아두면 그 사이 기간을 소급해 약속한 꼴이 된다.
//    머지·배포일이 아래와 다르면 반드시 맞춰서 고칠 것.
const REVISED_AT = "2026-09-19";

// `?plain=1` — 약관 동의 흐름에서 연 **읽기 전용** 탭이다. 푸터(와 내비)를 빼는 이유:
// 동의를 안 한 사람이 약관을 읽다가 링크를 타고 홈·매거진으로 새어 나갔다(2026-09-16 신고).
// 읽으러 온 탭은 읽고 닫는 곳이어야 한다.
export default async function PrivacyPage({ searchParams }: {
  searchParams: Promise<{ plain?: string }>;
}) {
  const plain = (await searchParams).plain === "1";
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
        <Section title="1. 수집하는 개인정보 항목과 수집 방법">
          {/*
            ⚠️ **항목마다 (필수)/(선택)을 반드시 붙일 것.**
            카카오 개인정보 동의항목 심사가 이것 하나로 반려된 적이 있다(2026-09-11) —
            *"개인정보처리방침 내 (전화번호) 항목은 수집 조건(필수/선택)이 확인되지 않습니다."*
            항목을 나열하는 것만으로는 부족하고, 각 항목이 필수인지 선택인지가 지면에서
            바로 읽혀야 한다.
          */}
          <p className="mb-2">
            서비스가 수집하는 항목은 다음과 같습니다. 항목마다 <strong>필수·선택</strong> 여부를
            함께 표시합니다.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>(필수)</strong> 계정 정보 — 표시 이름(닉네임), 이메일
            </li>
            <li>
              <strong>(선택)</strong> 프로필 이미지
            </li>
            <li>
              <strong>(선택)</strong> 전화번호 — 상담·예약 진행 상황 알림 발송
            </li>
            <li>
              <strong>(선택)</strong> 그 밖의 연락 수단 — 카카오톡 ID, 인스타그램 ID 등
            </li>
            <li>
              <strong>(선택)</strong> 상담 정보 — 촬영 목적, 희망 일정, 희망 지역, 인원, 요청
              사항 등 문의 시 입력한 내용
            </li>
            <li>
              <strong>(필수)</strong> 자동 수집 정보 — 서비스 이용 기록, 접속 로그, 기기·브라우저
              정보, 쿠키
            </li>
          </ul>
          <p className="mt-3 mb-2">수집 방법은 두 가지입니다.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>이용자가 서비스 화면에서 직접 입력하는 경우</li>
            <li>
              카카오 로그인(카카오싱크)으로 가입·로그인하는 경우, 이용자가 동의한 범위에서
              주식회사 카카오로부터 제공받습니다 — 표시 이름(필수), 이메일(필수),
              전화번호(선택)
            </li>
          </ul>
          <p className="mt-3">
            <strong>전화번호는 선택 항목입니다.</strong> 상담·예약 진행 상황을 알리기 위해
            수집하며, 제공에 동의하지 않아도 회원가입과 서비스 이용에 제한이 없습니다. 다만
            알림을 보낼 수단이 없으므로, 문의·예약을 진행하는 시점에 별도로 전화번호 등록을
            요청할 수 있습니다.
          </p>
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
            <strong className="font-semibold text-fg">
              이용자의 전화번호 등 연락처는 사진작가에게 제공되지 않습니다.
            </strong>{" "}
            상담은 서비스 내 채팅에서만 이루어지며, 작가에게는 상담·예약 진행에 필요한 범위에서
            이용자의 표시 이름과 문의·예약 내용만 표시됩니다. 작가에게 제공되는 항목과 근거는 다음과
            같습니다.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[22rem] border-collapse text-xs">
              <thead>
                <tr className="border-y border-line text-left text-muted">
                  <th className="py-2 pr-3 font-medium">제공받는 자</th>
                  <th className="py-2 pr-3 font-medium">제공 항목</th>
                  <th className="py-2 pr-3 font-medium">제공 목적·근거</th>
                  <th className="py-2 pr-3 font-medium">보유 기간</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line">
                  <td className="py-2 pr-3 align-top">이용자가 문의·예약한 작가</td>
                  <td className="py-2 pr-3 align-top">표시 이름, 문의 내용(촬영 종류·희망일·지역·인원·요청 사항), 예약 내용(촬영 일시·장소·금액·예약서에 적은 항목)</td>
                  <td className="py-2 pr-3 align-top">촬영 계약의 상담·체결·이행 (개인정보 보호법 제17조 제1항 제2호, 계약 이행에 필요한 경우)</td>
                  <td className="py-2 pr-3 align-top">촬영 계약 종료 후 작가가 지체 없이 파기 (작가 이용약관 제24조 2항)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2">
            전화번호·이메일·결제 계좌는 위 항목에 포함되지 않으며 작가에게 제공되지 않습니다. 이용자가 예약서의
            메모나 채팅에 직접 적은 내용은 이용자의 의사에 따른 것으로 보되, 연락처로 보이는 문자열은 서비스가
            자동으로 가립니다.
          </p>
          <p className="mt-2">
            반대 방향으로, <strong className="font-semibold text-fg">작가의 연락처</strong>는 예약 대금
            입금이 확인된 뒤 작가가 전달을 선택하고 이용자가 안내를 확인해 동의한 경우에 한해 이용자에게
            전달됩니다. 이때 전달되는 것은 작가의 연락 수단이며, 이 절차로 이용자의 개인정보가 작가에게
            제공되지는 않습니다.
          </p>
          <p className="mt-2">
            그 밖에 이용자의 동의가 있거나 법령에 근거가 있는 경우, 수사기관이 관련 법령이 정한 절차에
            따라 요청하는 경우 외에는 개인정보를 제3자에게 제공하지 않습니다.
          </p>
        </Section>

        <Section title="4. 개인정보의 보유 및 이용 기간">
          <p>
            수집한 개인정보는 수집·이용 목적이 달성되면 지체 없이 파기합니다. 다만 관련 법령에 따라 보존이
            필요한 경우 해당 기간 동안 보관합니다. 이용자는 언제든지 개인정보의 삭제를 요청할 수 있습니다.
          </p>
        </Section>

        {/*
          ⚠️ **수탁자를 실제로 적는다.** 전에는 "클라우드 인프라·메시지 발송·분석 등 일부
             업무를 외부 전문업체에 위탁할 수 있으며" 한 줄이었다. 그건 가능성 서술이지
             공개가 아니다 — 개인정보보호법 26조는 위탁업무의 내용과 **수탁자를 공개**하게 한다.
             (2026-09-19, docs/44)

          ⚠️ 특히 **Anthropic 과 Discord 를 빠뜨리기 쉽다.** 챗봇은 고객이 쓴 문의 내용을
             그대로 모델에 보내므로 인프라가 아니라 **처리 위탁**이고, 디스코드 운영 채널에는
             고객·작가 실명과 예약 정보가 올라간다. 옛 문구("인프라·발송·분석")로는 둘 다 안 덮였다.

          📌 **수탁자가 늘면 여기를 먼저 고친다.** 코드가 먼저 나가고 방침이 늦으면 그
             기간은 근거 없는 위탁이 된다. PG(KG이니시스)는 개통일에 한 줄 더한다(docs/42 §3-6).
        */}
        <Section title="5. 개인정보 처리의 위탁">
          <p>서비스는 원활한 서비스 제공을 위하여 아래와 같이 개인정보 처리 업무를 외부에 위탁하고 있습니다.</p>
          <Table
            head={["수탁자", "위탁 업무"]}
            rows={[
              ["Supabase Inc.", "데이터베이스·파일 저장 및 계정 인증"],
              ["Vercel Inc.", "서비스 호스팅 및 접속 기록 처리"],
              ["주식회사 솔라피", "문자메시지·카카오 알림톡 발송"],
              ["주식회사 카카오", "간편 로그인 인증"],
              ["Anthropic PBC", "상담 챗봇의 응답 생성"],
              ["Mixpanel Inc.", "서비스 이용 행태 분석"],
              ["Meta Platforms, Inc.", "광고 성과 측정"],
              ["Discord Inc.", "운영자 알림 수신"],
            ]}
          />
          <p className="mt-3">
            서비스는 위탁계약 체결 시 「개인정보 보호법」 제26조에 따라 위탁업무 수행 목적 외 개인정보 처리
            금지, 기술적·관리적 보호조치, 재위탁 제한, 수탁자에 대한 관리·감독, 손해배상 등 책임에 관한 사항을
            계약서에 명시하고, 수탁자가 개인정보를 안전하게 처리하는지를 감독합니다. 위탁업무의 내용이나
            수탁자가 변경될 경우 본 방침을 통하여 공개합니다.
          </p>
        </Section>

        {/* 위 수탁자 중 여섯 곳이 국외 사업자다 — 개인정보보호법 28조의8 은 이전받는 자·국가·
            시점·방법·항목·목적·보유기간을 알리게 한다. 위탁 공개와 **별개 의무**라 절을 나눈다. */}
        <Section title="5의2. 개인정보의 국외 이전">
          <p>서비스는 아래와 같이 개인정보를 국외로 이전합니다.</p>
          <Table
            head={["이전받는 자", "국가", "이전 항목", "이전 목적"]}
            rows={[
              ["Supabase Inc.", "미국", "계정·프로필·대화·사진", "데이터베이스·파일 저장"],
              ["Vercel Inc.", "미국", "접속 기록", "서비스 호스팅"],
              ["Anthropic PBC", "미국", "채팅 대화 내용", "상담 챗봇 응답 생성"],
              ["Mixpanel Inc.", "미국", "식별자·행동 로그", "이용 행태 분석"],
              ["Meta Platforms, Inc.", "미국", "광고 식별자", "광고 성과 측정"],
              ["Discord Inc.", "미국", "이름·예약 정보", "운영자 알림"],
            ]}
          />
          <p className="mt-3">
            이전 시점과 방법은 <b className="font-medium text-fg">서비스 이용 중 해당 기능이 동작할 때 정보통신망을
            통한 전송</b>이며, 보유·이용 기간은 <b className="font-medium text-fg">회원 탈퇴 시 또는 위탁계약 종료
            시까지</b>입니다.
          </p>
          <p className="mt-2">
            이용자는 개인정보의 국외 이전을 거부할 수 있습니다. 다만 거부하는 경우 서비스의 전부 또는 일부를
            이용할 수 없습니다. 거부는 아래 문의처 또는 <Link href="/settings" className="underline underline-offset-2">계정
            설정</Link>의 개인정보 요청으로 접수할 수 있습니다.
          </p>
        </Section>

        <Section title="6. 이용자의 권리">
          <p>
            이용자는 자신의 개인정보에 대해 열람·정정·삭제·처리정지를 요청할 수 있습니다. 요청은{" "}
            <Link href="/settings" className="underline underline-offset-2">계정 설정 &gt; 내 개인정보</Link>{" "}
            또는 아래 문의처를 통해 접수할 수 있으며, 서비스는 본인 확인 후 지체 없이 필요한 조치를 취하고
            그 결과를 알려드립니다.
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

      <p className="mt-10 text-xs text-faint">
        시행일: 2026-06-26 · 최종 개정일: {REVISED_AT} · 본 방침은 관련 법령 및 서비스 변경에 따라
        개정될 수 있습니다.
      </p>

      {!plain && <SiteFooter />}
    </main>
  );
}

// 수탁자·국외이전 표. 모바일에서 넘치면 **가로로 스크롤**한다 — 줄바꿈으로 뭉개지면
// 어느 업체가 무슨 일을 하는지 짝이 안 맞아 읽을 수가 없다.
function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[26rem] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-fg/15">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap py-2 pr-3 font-semibold text-fg">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-fg/[0.07] last:border-0">
              {r.map((c, i) => (
                <td key={i} className={`py-2 pr-3 align-top ${i === 0 ? "whitespace-nowrap font-medium text-fg" : "text-muted"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
