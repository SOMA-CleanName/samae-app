import Link from "next/link";
import { InlineDocSheet } from "@/components/legal/InlineDocSheet";
import { FeePolicyBody } from "@/components/legal/docs/FeePolicyBody";
import { PhotographerTermsBody } from "@/components/legal/docs/PhotographerTermsBody";
import { FEE_POLICY_VERSION, PHOTOGRAPHER_TERMS_VERSION } from "@/lib/policy-version";
import { Button } from "@/components/ui";

// 비로그인 방문자가 보는 /apply — 작가 모집 링크가 닿는 첫 화면.
//
// 여기가 **작가에게 뿌리는 주소**다. 예전에는 로그인부터 시키고 프로필을 뒤져야
// 신청 버튼이 나왔다. 처음 온 사람에게 "가입하고 프로필 메뉴에서 작가 신청을
// 누르세요" 는 링크 하나로 끝나야 할 일을 세 단계로 늘린다.
//
// 그래서 이 지면은 로그인 없이 열리고, 가입/로그인 뒤 **이 자리로 돌아온다**(next=/apply).
// 돌아오면 바로 신청 폼이다.
//
// 타이포는 역할 클래스(text-h1/body/caption), 버튼은 프리미티브를 쓴다 — docs/14.

const STEPS = [
  { t: "가입하고 신청서 작성", d: "작가명·포트폴리오 링크·연락처면 됩니다. 몇 분이면 끝나요." },
  { t: "운영자 검토", d: "보통 영업일 기준 1~2일 걸려요. 결과는 따로 알려드려요." },
  { t: "사진 올리고 의뢰 받기", d: "승인되면 사진이 지면에 노출되고, 고객 문의가 채팅으로 들어와요." },
];

export function ApplyIntro() {
  return (
    <main className="mx-auto max-w-lg px-5 py-12 font-kr">
      <p className="text-label uppercase tracking-wide text-brand">작가 모집</p>
      <h1 className="mt-2.5 text-h1 font-bold tracking-tight">
        사매에서 사진으로
        <br />
        의뢰를 받아보세요
      </h1>
      <p className="mt-3 text-body leading-relaxed text-muted">
        포트폴리오를 올리면 촬영을 찾는 사람들이 사진을 보고 문의합니다. 일정·금액·결과물 전달까지
        서비스 안에서 처리돼요.
      </p>

      {/* 세 걸음 — 번호는 세로선으로 이어 흐름이 보이게 */}
      <ol className="mt-9 flex flex-col">
        {STEPS.map((s, i) => (
          <li key={s.t} className="relative flex gap-4 pb-7 last:pb-0">
            {/* 마지막 항목엔 선을 긋지 않는다 — 다음이 없는데 이어지면 안 된다 */}
            {i < STEPS.length - 1 && (
              <span aria-hidden className="absolute bottom-1 left-[13px] top-8 w-px bg-line" />
            )}
            <span className="relative grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-fg text-caption font-semibold text-bg">
              {i + 1}
            </span>
            <span className="min-w-0 pt-0.5">
              <span className="block text-body font-semibold">{s.t}</span>
              <span className="mt-1 block text-body-sm leading-relaxed text-muted">{s.d}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* 가입과 신청을 한 줄로 잇는다 — 돌아올 자리를 next 로 들고 간다 */}
      <div className="mt-10 flex flex-col gap-2.5">
        <Button href="/signup?next=/apply" variant="brand" size="lg" fullWidth>
          작가 신청 시작하기
        </Button>
        <Button href="/login?next=/apply" variant="secondary" size="lg" fullWidth>
          이미 계정이 있어요
        </Button>
      </div>

      {/* 이 두 링크는 **지면을 떠나지 않는다.** 전에는 /terms/fees·/terms/photographer 로
          이동해 버려서, 읽고 나면 그 지면의 내비·푸터를 타고 홈으로 흘러갔다. 신청하러 온
          사람을 약관 읽히려다 놓치는 셈이다. 덮개로 띄우고 닫으면 여기 그대로 돌아온다. */}
      <p className="mt-7 text-caption leading-relaxed text-muted">
        신청 전에{" "}
        <InlineDocSheet
          label="수수료·정산 정책"
          title="사매 수수료·정산 정책"
          version={FEE_POLICY_VERSION}
        >
          <FeePolicyBody />
        </InlineDocSheet>
        과{" "}
        <InlineDocSheet
          label="작가 이용약관"
          title="사매 작가 이용약관"
          version={PHOTOGRAPHER_TERMS_VERSION}
        >
          <PhotographerTermsBody />
        </InlineDocSheet>
        을 미리 보실 수 있어요. 승인 뒤 스튜디오에서 다시 한 번 확인하고 동의하게 됩니다.
      </p>

      <Link
        href="/"
        className="mt-9 inline-block text-body-sm font-medium text-muted transition-colors hover:text-fg"
      >
        ← 사진 보러 가기
      </Link>
    </main>
  );
}
