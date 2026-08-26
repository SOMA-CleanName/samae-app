import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SCRIPT, MAX_SCRIPT_QUESTIONS } from "@/lib/photographer-scripts";
import { savePhotographerBotScript } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

const inputCls =
  "w-full rounded-lg border border-fg/15 bg-surface px-3 py-2 text-sm outline-none focus:border-fg/40";

// 커스텀 챗봇 대본 편집 — 자동 응답 봇의 말투(tone)와 작가별 추가 질문(최대 3개)을 설정한다.
// 봇은 공통 4가지(촬영 종류·희망일·지역·인원)를 먼저 수집한 뒤, 여기 등록된 질문을 이어서 묻는다.
export default async function StudioBotPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/studio/bot");
  if (!me.photographer) redirect("/studio");

  const supabase = await createClient();
  const { data } = await supabase
    .from("photographer_bot_scripts")
    .select("tone, custom_questions")
    .eq("photographer_id", me.photographer.id)
    .maybeSingle();

  const tone = typeof data?.tone === "string" ? data.tone : "";
  const questions = Array.isArray(data?.custom_questions)
    ? (data!.custom_questions as unknown[]).filter((q): q is string => typeof q === "string")
    : [];

  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-10 font-kr">
      <Link href="/studio" className="text-sm text-fg/50 hover:text-fg">
        ← 스튜디오
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">문의 챗봇 설정</h1>
      <p className="mt-1 text-sm text-fg/55">
        고객이 문의를 시작하면 자동 응답 봇이 먼저 기본 정보(촬영 종류·희망일·지역·인원)를
        여쭤봐요. 여기서 봇의 말투와, 기본 정보 다음에 이어서 물어볼 작가님만의 질문을 정할 수
        있어요.
      </p>

      {saved === "1" && (
        <p className="mt-4 rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success">
          저장했어요 — 다음 문의부터 바로 적용돼요.
        </p>
      )}

      <form action={savePhotographerBotScript} className="mt-6 space-y-6">
        <section className="rounded-xl border border-fg/15 p-4">
          <h2 className="text-sm font-semibold">봇 말투</h2>
          <p className="mt-1 text-xs text-fg/55">
            비워두면 기본 말투(따뜻하고 간결한 존댓말)를 사용해요.
          </p>
          <textarea
            name="tone"
            rows={2}
            maxLength={300}
            defaultValue={tone}
            placeholder={DEFAULT_SCRIPT.tone}
            className={`mt-3 resize-none ${inputCls}`}
          />
        </section>

        <section className="rounded-xl border border-fg/15 p-4">
          <h2 className="text-sm font-semibold">추가 질문 (최대 {MAX_SCRIPT_QUESTIONS}개)</h2>
          <p className="mt-1 text-xs text-fg/55">
            봇이 이 문구를 그대로 읽지 않고, 대화 흐름에 맞게 자연스럽게 물어봐요. 평소 고객에게
            꼭 확인하시는 것들을 적어주세요. (예: &quot;원하시는 배경이나 분위기가 있나요?&quot;,
            &quot;참고하고 싶은 레퍼런스가 있나요?&quot;)
          </p>
          <div className="mt-3 space-y-2">
            {Array.from({ length: MAX_SCRIPT_QUESTIONS }, (_, i) => (
              <input
                key={i}
                name={`question${i}`}
                maxLength={200}
                defaultValue={questions[i] ?? ""}
                placeholder={`질문 ${i + 1}${i === 0 ? "" : " (선택)"}`}
                className={inputCls}
              />
            ))}
          </div>
        </section>

        <SubmitButton
          pendingText="저장 중…"
          className="w-full cursor-pointer rounded-full bg-fg py-3 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          저장
        </SubmitButton>
      </form>
    </main>
  );
}
