// KB 카드 문장을 사매 문체로 다듬는다.
//
// 왜 필요한가: 카드 본문은 **저장 문장이자 안내 이미지에 그대로 실리는 문장**이다.
// 봇은 카드를 읽고 대화체로 다시 쓰므로 카드가 답변처럼 생길 이유가 없는데,
// 모델이 뽑아 놓으면 자꾸 "답변 문장"이 된다 — 겸양이 겹치고, 모든 카드가 정확히
// 두 문장이 되고, 두 번째 문장이 전부 "원하시면 말씀해주세요" 로 끝난다.
// 그 규칙성이 곧 기계가 쓴 티다.
//
// 그래서 문체 규칙을 한 곳에 두고 **추출과 다듬기가 같은 규칙을 본다.** 규칙이
// 두 군데 있으면 새로 뽑은 카드와 다듬은 카드의 말투가 갈린다.
//
// 사실은 못 건드린다: 다듬기는 문장만 고치는 일이라, 숫자·기한·조건이 바뀌면
// 그건 다듬은 게 아니라 틀린 것이다. checkFactsKept 가 그걸 막는다.

import Anthropic from "@anthropic-ai/sdk";
import { anthropicClientOptions } from "./anthropic-client";
import { MAX_CARD_BODY, allowedNumbers, deadlines, type KbCard } from "./bot-kb";

const POLISH_MODEL = process.env.ANTHROPIC_EXTRACT_MODEL || "claude-opus-5";

/**
 * 사매 안내 문체.
 *
 * 추출 프롬프트와 다듬기 프롬프트가 같이 읽는다. 고칠 일이 있으면 여기만 고친다.
 */
export const KB_WRITING_RULES = `[문장 쓰는 법]
이 문장은 **안내 이미지에 그대로 실립니다.** 손님이 스크롤하며 훑어보는 글이라,
읽는 데 걸리는 시간이 곧 품질입니다. 정보를 먼저 주고, 부드럽게 끝냅니다.

지킬 것
- **정보를 앞에 둡니다.** 금액·장수·시간이 문장 첫머리에 오게 씁니다.
- **한 카드에 한 가지.** 다 말하려 하지 말고, 그 주제에서 가장 중요한 것만 남깁니다.
- **길이를 일부러 맞추지 마세요.** 한 문장으로 끝나면 한 문장으로 둡니다.
  모든 카드가 같은 길이·같은 리듬이면 사람이 쓴 글로 읽히지 않습니다.
- 조건이 붙은 사실은 조건을 반드시 같이 씁니다("동의하시면", "사전에", "N일 전까지").
  조건을 떼면 문장은 깔끔해지지만 안내가 틀려집니다.
- **어미는 카드 전체에서 하나로 통일합니다. 기본은 "~해요/~예요" 입니다.**
  한 장에 여러 카드가 나란히 실리기 때문에, 어떤 카드는 "찍어요" 로 끝나고 옆 카드는
  "촬영합니다" 로 끝나면 덜 다듬은 초안처럼 보입니다. 의무를 말할 때도 "말씀해주셔야
  해요" 로 씁니다 — 부드러워져도 뜻은 그대로입니다.
- **두 번째 문장이 정보를 더하지 않으면 지웁니다.** 사실을 말한 뒤 한 번 더 감싸고 싶은
  충동이 드는데, 그 문장이 대개 기계가 쓴 티가 나는 자리입니다.

피할 것
- **겸양 과잉.** "제공해드립니다", "작업해드립니다", "정리해드립니다", "잡아드려요" —
  실제로 건네는 것에만 "드려요" 를 쓰고, 나머지는 "해요/합니다" 로 씁니다.
- **빈 수식.** "그날의 공기와 표정이 남도록", "소중한 순간을" 같은 문구는 정보가 없습니다.
  작가가 실제로 그렇게 말했더라도 안내 이미지에서는 뺍니다.
- **무마용 끝문장.** "원하시면 말씀해주세요", "편하게 문의주세요" 를 카드마다 붙이지 마세요.
  꼭 필요한 한두 장에만 남기고, 나머지는 사실로 끝냅니다.
- **수동태 반복.** "진행됩니다", "포함되어 있습니다", "보관됩니다" 가 이어지면 딱딱해집니다.
  주어를 세워 "~합니다/~해요" 로 바꿀 수 있으면 바꿉니다.
- **같은 사실 반복.** 다른 카드에 이미 있는 내용(대여비 포함, 촬영 시간)은 되풀이하지 않습니다.

보기
- ✗ 성수동 스튜디오에서 진행되며 대여비가 촬영 금액에 포함되어 있습니다. 야외 촬영을 원하시면 상담 시 말씀해주세요.
  ✓ 성수동 스튜디오에서 찍어요. 야외 촬영도 하니 생각해두신 곳이 있으면 알려주세요.
    (대여비는 가격 카드에 이미 있어서 뺐습니다)
- ✗ 자연스러운 피부 보정과 색감 보정이 기본으로 포함됩니다. 얼굴형이나 체형 보정을 원하시면 사전에 말씀해주세요.
  ✓ 피부·색감 보정은 기본으로 들어가요. 얼굴형·체형 보정은 사전에 말씀해주셔야 해요.
- ✗ 최종 결과물을 받으신 뒤 수정은 2회까지 가능합니다. 전체를 확인하신 뒤 한 번에 정리해서 전달해주시면 됩니다.
  ✓ 최종본을 받으신 뒤 수정은 2회까지 돼요. 한 번에 모아서 알려주세요.
- ✗ 하루필름은 자연광이 드는 공간에서 인물의 편안한 순간을 담는 스냅 작업을 합니다. 과한 연출 대신 그날의 공기와 표정이 남도록 촬영합니다.
  ✓ 자연광이 드는 공간에서 인물 스냅을 찍어요. 과한 연출은 하지 않아요.`;

const POLISH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "body"],
        properties: {
          id: { type: "string" },
          body: { type: "string", maxLength: MAX_CARD_BODY },
          /** 왜 이렇게 고쳤는지 한 줄 — 운영이 전/후를 볼 때 판단 근거가 된다 */
          note: { type: "string" },
          /** 다른 카드와 겹쳐서 뺀 내용이 있으면 여기에 */
          dropped: { type: "string" },
        },
      },
    },
  },
} as const;

export type PolishedCard = {
  id: string;
  before: string;
  after: string;
  note?: string;
  dropped?: string;
  /** 사실이 바뀐 것으로 보이는 곳 — 비어 있지 않으면 자동 적용하지 않는다 */
  problems: string[];
};

/**
 * 다듬기가 **사실을 안 바꿨는지** 본다.
 *
 * 문장을 줄이다 보면 숫자나 조건이 같이 사라진다. 그건 깔끔해진 게 아니라 틀린 것이고,
 * 금액·기한이 걸리면 분쟁 근거가 된다. 그래서 눈으로 보고 넘기지 않고 여기서 센다.
 */
export function checkFactsKept(before: string, after: string): string[] {
  const problems: string[] = [];

  // 숫자: 원본에 있던 것이 결과에 없으면 사실이 빠진 것이다.
  // 반대(새 숫자 등장)도 막는다 — 다듬기는 없던 수를 만들 일이 없다.
  const had = allowedNumbers([before]);
  const now = allowedNumbers([after]);
  const lost = [...had].filter((n) => n > 1 && !now.has(n));
  const added = [...now].filter((n) => n > 1 && !had.has(n));
  if (lost.length > 0) problems.push(`빠진 숫자: ${lost.join(", ")}`);
  if (added.length > 0) problems.push(`없던 숫자: ${added.join(", ")}`);

  // 기한은 숫자 검사로 잡히더라도 단위가 바뀌면(7일 → 7주) 못 잡는다
  const hadD = deadlines(before);
  const nowD = deadlines(after);
  const lostD = [...hadD].filter((d) => !nowD.has(d));
  if (lostD.length > 0) problems.push(`빠진 기한: ${lostD.join(", ")}`);

  // 조건 표지어. 조건을 떼면 문장은 깔끔해지지만 안내가 틀려진다
  // ("동의하시면 2장 더" → "2장 더" 는 전혀 다른 말이다)
  for (const [label, re] of CONDITION_MARKERS) {
    if (re.test(before) && !re.test(after)) problems.push(`빠진 조건: ${label}`);
  }

  return problems;
}

/** 빠지면 안내가 틀려지는 조건 표지어 */
const CONDITION_MARKERS: [string, RegExp][] = [
  // "별도" 를 "따로"·"추가로" 로 바꾸는 건 뜻이 같다 — 같은 묶음으로 본다
  ["별도", /별도|따로|추가\s*(금액|비용|로)/],
  ["제외", /제외|포함되지\s*않|불가/],
  ["사전 고지", /사전에|미리\s*(말씀|알려)/],
  ["동의", /동의/],
  ["기한", /까지|이내/],
];

/**
 * 저장된 카드의 문장만 다시 쓴다. 사실은 그대로 둔다.
 *
 * 카드를 통째로 넘기는 이유: 중복은 카드 하나만 봐서는 못 없앤다. "대여비 포함" 이
 * 가격 카드에도 있다는 걸 알아야 촬영장소 카드에서 뺄 수 있다.
 */
export async function polishCards(cards: KbCard[]): Promise<PolishedCard[]> {
  if (cards.length === 0) return [];

  const { clientOptions } = anthropicClientOptions();
  const client = new Anthropic(clientOptions);
  const request = {
    model: POLISH_MODEL,
    max_tokens: 32000,
    output_config: { format: { type: "json_schema" as const, schema: POLISH_SCHEMA } },
    system: `당신은 사진 촬영 중개 플랫폼 "사매"의 운영자입니다.
이미 확인이 끝난 지식 카드의 **문장만** 다시 씁니다.

${KB_WRITING_RULES}

[절대 규칙]
- **사실을 바꾸지 마세요.** 금액·장수·시간·기한·조건은 원문 그대로 옮깁니다.
  줄이다가 숫자나 조건이 빠지면 안내가 틀려지고, 그건 다듬은 게 아닙니다.
- **없던 내용을 넣지 마세요.** 자연스럽게 보이려고 정보를 보태면 안 됩니다.
- 카드를 합치거나 없애지 마세요. 받은 id 를 그대로 하나씩 돌려줍니다.
- 다른 카드와 겹쳐 뺀 내용이 있으면 dropped 에 무엇을 뺐는지 적으세요.
- 고칠 데가 없으면 원문을 그대로 돌려주세요. 억지로 바꾸지 않습니다.`,
    messages: [
      {
        role: "user" as const,
        content: `아래 카드들의 문장을 다듬어 주세요. 안내 이미지에 이 문장이 그대로 실립니다.

${cards.map((c) => `[${c.id}] (${c.topic}) ${c.body}`).join("\n")}`,
      },
    ],
  };

  // output_config 는 SDK 타입보다 앞서 있다 — kb-extract 와 같은 사정
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = client.messages.stream(request as any);
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new Error("모델이 이 카드의 처리를 거부했어요.");
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) throw new Error("모델이 빈 응답을 돌려줬어요.");

  const raw = JSON.parse(text) as {
    cards: { id: string; body: string; note?: string; dropped?: string }[];
  };
  return mergePolished(cards, raw.cards);
}

/**
 * 모델 결과를 원본과 맞춰 붙인다. 돌려주지 않은 카드는 원문 유지 —
 * 누락된 카드를 빈 문장으로 덮으면 안내가 통째로 사라진다.
 */
export function mergePolished(
  cards: KbCard[],
  polished: { id: string; body?: string; note?: string; dropped?: string }[]
): PolishedCard[] {
  const byId = new Map(polished.map((p) => [p.id, p]));
  return cards.map((c) => {
    const after = byId.get(c.id)?.body?.trim().slice(0, MAX_CARD_BODY) || c.body;
    const p = byId.get(c.id);
    return {
      id: c.id,
      before: c.body,
      after,
      note: p?.note?.trim() || undefined,
      dropped: p?.dropped?.trim() || undefined,
      problems: after === c.body ? [] : checkFactsKept(c.body, after),
    };
  });
}
