import type { ReactNode } from "react";

/**
 * 잡지 표제(마스트헤드).
 *
 * /articles 의 STORIES 와 같은 장치다. 두 지면이 한 잡지처럼 읽히려면
 * 표제 규격이 같아야 해서 컴포넌트로 뽑았다.
 *
 * 다만 크기는 지면마다 다르다. /articles 는 읽으러 들어오는 곳이라 표제가
 * 화면을 채워도 되지만, 탐색은 **사진을 보러 오는 곳**이라 표제가 사진을
 * 접는 순간 손해다. size="compact" 가 그 경우다.
 */
export function Masthead({
  word,
  lead,
  meta,
  action,
  size = "full",
}: {
  /** 표제 한 단어. 대문자 라틴 — 한글 제목은 lead 로 받는다. */
  word: string;
  /** 표제 아래 한 줄. 이 지면이 뭘 하는 곳인지. */
  lead?: string;
  /** 발행 정보 — 날짜·수량 같은 사실만 넣는다. 표제 위 왼쪽. */
  meta?: ReactNode;
  /**
   * 표제 위 오른쪽에 세우는 버튼 한 개(매거진 지면의 ProfileButton).
   *
   * meta 자리에 끼워 넣지 않는다 — 거긴 11px 대문자 텍스트를 baseline 으로
   * 맞추는 줄이라 36px 버튼을 넣으면 줄이 어긋난다. 둘은 같은 행을 쓰되
   * 정렬 기준이 다르다.
   */
  action?: ReactNode;
  size?: "full" | "compact";
}) {
  const scale =
    size === "full"
      ? "text-[clamp(3.2rem,15vw,11rem)]"
      : "text-[clamp(2.4rem,11vw,6.5rem)]";

  return (
    <header>
      {(meta || action) && (
        // 왼쪽 칸은 action 만 있을 때도 비워 둔 채 렌더한다 —
        // justify-between 이 오른쪽 버튼을 끝으로 밀어 주는 건 형제가 둘일 때뿐이다.
        <div className={`flex items-center justify-between gap-3 ${action ? "min-h-9" : ""}`}>
          {/* flex-1 — 이게 없으면 meta 안의 항목들을 벌려 주던 justify-between 이
              내용 폭까지만 작동한다(다른 지면들이 쓰는 배치가 깨진다) */}
          <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            {meta}
          </div>
          {action}
        </div>
      )}

      {/*
        overflow-hidden + 자식 span 이 아래에서 올라온다(ed-mast).

        line-height 를 0.82 로 조여 놨는데, 그러면 글자 아랫부분(Q 의 꼬리, 대문자
        오버슛)이 line box 밖으로 나가고 overflow-hidden 이 그걸 잘라 냈다.
        마스크는 애니메이션에 필요하니 없앨 수 없어서, 자식에 아래 여백을 줘
        line box 자체를 글자보다 크게 만든다.
      */}
      <h1 className="ed-mast mt-3 overflow-hidden leading-[0.82]">
        <span className={`block pb-[0.1em] font-extrabold tracking-[-0.05em] ${scale}`}>
          {word}
        </span>
      </h1>

      {lead && (
        <p className="mt-3 max-w-md text-body-sm leading-relaxed text-muted">{lead}</p>
      )}
    </header>
  );
}
