import Link from "next/link";

// 비로그인 방문자가 보는 /apply — 작가 모집 링크가 닿는 첫 화면.
//
// 여기가 **작가에게 뿌리는 주소**다. 예전에는 로그인부터 시키고 프로필을 뒤져야
// 신청 버튼이 나왔다. 처음 온 사람에게 "가입하고 프로필 메뉴에서 작가 신청을
// 누르세요" 는 링크 하나로 끝나야 할 일을 세 단계로 늘린다.
//
// 그래서 이 지면은 로그인 없이 열리고, 가입/로그인 뒤 **이 자리로 돌아온다**(next=/apply).
// 돌아오면 바로 신청 폼이다.

const STEPS = [
  { n: "1", t: "가입하고 신청서 작성", d: "작가명·포트폴리오 링크·연락처면 됩니다. 몇 분이면 끝나요." },
  { n: "2", t: "운영자 검토", d: "보통 영업일 기준 1~2일 걸려요. 결과는 따로 알려드려요." },
  { n: "3", t: "사진 올리고 의뢰 받기", d: "승인되면 사진이 지면에 노출되고, 고객 문의가 채팅으로 들어와요." },
];

export function ApplyIntro() {
  return (
    <main className="mx-auto max-w-lg px-3.5 py-10 font-kr sm:px-5">
      <h1 className="text-2xl font-semibold leading-snug">
        사매에서 사진으로
        <br />
        의뢰를 받아보세요
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        포트폴리오를 올리면 촬영을 찾는 사람들이 사진을 보고 문의합니다. 일정·금액·결과물 전달까지
        서비스 안에서 처리돼요.
      </p>

      <ol className="mt-8 flex flex-col gap-5">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-3.5">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-fg text-xs font-semibold text-bg">
              {s.n}
            </span>
            <span>
              <span className="block text-sm font-semibold">{s.t}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">{s.d}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* 가입과 신청을 한 줄로 잇는다 — 돌아올 자리를 next 로 들고 간다 */}
      <div className="mt-9 flex flex-col gap-2.5">
        <Link
          href="/signup?next=/apply"
          className="block w-full rounded-xl bg-fg py-3.5 text-center text-sm font-semibold text-bg transition-opacity hover:opacity-90"
        >
          작가 신청 시작하기
        </Link>
        <Link
          href="/login?next=/apply"
          className="block w-full rounded-xl border border-line-strong py-3.5 text-center text-sm font-medium transition-colors hover:bg-fg/[0.04]"
        >
          이미 계정이 있어요
        </Link>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-faint">
        신청 전에{" "}
        <Link href="/terms/fees" className="underline underline-offset-2">
          수수료·정산 정책
        </Link>
        과{" "}
        <Link href="/terms/photographer" className="underline underline-offset-2">
          작가 이용약관
        </Link>
        을 미리 보실 수 있어요. 승인 뒤 스튜디오에서 다시 한 번 확인하고 동의하게 됩니다.
      </p>

      <Link href="/" className="mt-8 inline-block text-sm text-muted hover:text-fg">
        ← 사진 보러 가기
      </Link>
    </main>
  );
}
