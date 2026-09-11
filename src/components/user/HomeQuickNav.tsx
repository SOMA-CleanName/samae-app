import Link from "next/link";

/**
 * 홈 바로가기 — 폭에 따라 두 가지 모양.
 *
 * 폰(~640px): 아이콘 위, 이름 아래. 다섯 칸이 화면 폭을 나눠 갖는다.
 *   아이콘과 이름을 가로로 붙이면 알약 하나가 90px 을 넘어 다섯 개가 안 들어간다.
 *   세로로 쌓으면 칸당 68px 로 줄어 375px 화면에서도 스크롤 없이 전부 보인다.
 *   옆으로 밀어야 보이는 항목은 절반이 안 눌린다.
 *
 * 그 위(sm~): 아이콘 옆에 이름을 붙인 알약을 왼쪽부터 늘어놓는다.
 *   위의 제약은 폰 폭에서만 성립한다. 넓은 화면에서 grid-cols-5 를 그대로 두면
 *   1500px 를 다섯으로 나눠 칸마다 300px 가 되고, 그 한가운데 44px 아이콘 하나가
 *   떠 있게 된다 — 항목 사이가 250px 씩 벌어져 한 세트로 안 읽힌다.
 *   폭을 정해 왼쪽으로 모으면 로고·검색과 같은 선에서 시작해 줄이 맞는다.
 *
 * 다섯 개 모두 같은 선 굵기(1.7)·같은 크기(20px) 아이콘이다.
 * 전에는 둘만 사진이고 셋은 도형이라 성격이 갈렸고, 32px 원에 들어간 사진은
 * 무슨 사진인지 안 보여 있으나 마나였다. 작은 자리에서 사진은 정보가 못 된다.
 */

type Chip = {
  href: string;
  label: string;
  icon: "story" | "place" | "qna" | "taste" | "persona";
};

/*
  라벨은 **누르면 뭐가 나오는지**를 말해야 한다. 두 글자로 줄이면 짧고 단정해 보이지만
  "장소"·"취향" 만으로는 눌러 볼 이유가 안 생긴다(팀원 QA: "텍스트와 아이콘만 봐서는
  뭐가 있는지 모르겠음 안눌러볼듯"). 한 단어 더 붙여 목적어를 준다.

  · 매거진   — 하단 내비 탭과 **같은 이름을 유지한다.** 같은 곳(/explore)인데 이름이 다르면
               두 군데인 줄 안다. (아티클 콘텐츠 자체는 '읽을거리'로 부른다 — 지면 이름과 다른 층)
  · 페르소나 — 캠페인 고유명이라 개발이 바꾸지 않는다. 바꾸려면 마케팅과 같이 정해야 한다.
*/
const CHIPS: Chip[] = [
  { href: "/explore", label: "매거진", icon: "story" },
  { href: "/spots", label: "촬영 장소", icon: "place" },
  { href: "/guide", label: "Q&A", icon: "qna" },
  { href: "/explore/quiz", label: "취향 테스트", icon: "taste" },
  { href: "/event/persona", label: "페르소나", icon: "persona" },
];

/** 다섯 개가 한 세트로 보이도록 선 굵기·크기·여백을 똑같이 맞춘다. */
function Icon({ kind }: { kind: Chip["icon"] }) {
  const p = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5",
    "aria-hidden": true,
  };
  switch (kind) {
    case "story": // 펼친 지면
      return (
        <svg {...p}>
          <path d="M12 6.5S10 4.8 6.5 4.8 3 6 3 6v12s1.2-1.2 3.5-1.2S12 18.5 12 18.5" />
          <path d="M12 6.5s2-1.7 5.5-1.7S21 6 21 6v12s-1.2-1.2-3.5-1.2S12 18.5 12 18.5" />
          <path d="M12 6.5v12" />
        </svg>
      );
    case "place": // 지도 핀
      return (
        <svg {...p}>
          <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case "qna": // 말풍선 + 물음
      return (
        <svg {...p}>
          <path d="M20.5 12a7.5 7.5 0 0 1-7.5 7.5H8l-4.5 3v-6A7.5 7.5 0 0 1 11 4.5h2A7.5 7.5 0 0 1 20.5 12Z" />
          <path d="M10.4 10a1.7 1.7 0 1 1 2.4 1.6c-.6.3-.9.8-.9 1.4" />
          <path d="M12 15.6h.01" />
        </svg>
      );
    case "taste": // 사진 두 장을 겹쳐 고르는 모습
      return (
        <svg {...p}>
          <rect x="3" y="7" width="12" height="12" rx="2" />
          <path d="M9 7V5.5A2.5 2.5 0 0 1 11.5 3h7A2.5 2.5 0 0 1 21 5.5v7a2.5 2.5 0 0 1-2.5 2.5H17" />
          <path d="m6 15.5 2.3-2.3 2.7 2.7" />
        </svg>
      );
    default: // persona — 인물 + 둘레
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="10" r="2.6" />
          <path d="M6.8 18.5a5.6 5.6 0 0 1 10.4 0" />
        </svg>
      );
  }
}

export function HomeQuickNav() {
  return (
    // lg 이상에서는 좌측 칸(17rem)에 들어간다 — 아래 여백은 바깥 2단 컨테이너가 준다.
    <nav aria-label="바로가기" className="mb-6 lg:mb-0">
      <ul className="grid grid-cols-5 gap-1 sm:flex sm:flex-wrap sm:gap-2">
        {CHIPS.map((c, i) => (
          // 로드 때 순서대로 자리를 잡는다
          <li key={c.href} className="ed-rise" style={{ ["--i" as string]: i }}>
            <Link
              href={c.href}
              className="qp flex flex-col items-center gap-1.5 py-1 sm:flex-row sm:gap-2 sm:rounded-full sm:border sm:border-line sm:bg-surface sm:py-1.5 sm:pl-1.5 sm:pr-4"
            >
              <span className="qp-dot grid h-11 w-11 place-items-center rounded-full bg-brand-soft text-brand sm:h-9 sm:w-9">
                <Icon kind={c.icon} />
              </span>
              <span className="qp-label block max-w-full truncate text-[11px] font-bold tracking-tight sm:text-sm">
                {c.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
