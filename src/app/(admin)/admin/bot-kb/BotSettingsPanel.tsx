"use client";

// 봇 전역 정책 — 작가별 지식(KB) 위에 있는 "모든 작가 봇에 동시에 걸리는" 설정.
//
// 여기 있는 것들은 여태 코드 상수라 한 줄 바꾸려면 배포가 필요했다.
// 특히 킬스위치: 봇이 잘못 말하고 있을 때 배포를 기다릴 수 없다.

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { DEFAULT_MESSAGES, PHOTOGRAPHER_TOKEN } from "@/lib/bot-messages";
import { saveBotSettings, type SaveSettingsState } from "./settings-actions";

const EMPTY: SaveSettingsState = { ok: false, error: null };

type Props = {
  enabled: boolean;
  policyText: string;
  policyVersion: number;
  defaultTone: string;
  model: string;
  updatedAt: string | null;
  botName: string;
  msgGreeting: string;
  msgHandoff: string;
  msgNoAnswer: string;
  msgError: string;
  /** 비워뒀을 때 실제로 쓰이는 코드 상수 — placeholder 로 보여준다 */
  fallbackPolicy: string;
  fallbackModel: string;
};

export function BotSettingsPanel(props: Props) {
  const [state, formAction] = useActionState(saveBotSettings, EMPTY);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(props.enabled);

  return (
    <section className="mt-5 rounded-2xl border border-line bg-surface">
      {/* 헤더 줄 전체가 토글이다 — 배지·"열기" 글자만 클릭이 안 먹으면 눌러도 반응이 없어 보인다 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-fg/[0.03]"
      >
        <span className="text-body-sm font-semibold text-fg">전역 정책</span>
        <span className="text-caption text-muted">모든 작가 봇에 동시에 적용돼요</span>
        {/* 상태는 접혀 있어도 보여야 한다 — 봇이 꺼져 있는 걸 모르는 게 제일 위험하다 */}
        {enabled ? (
          <span className="ml-auto rounded-full bg-success-soft px-2.5 py-1 text-caption font-medium text-success">
            봇 동작 중
          </span>
        ) : (
          <span className="ml-auto rounded-full bg-danger/10 px-2.5 py-1 text-caption font-semibold text-danger">
            봇 정지됨
          </span>
        )}
        <span className="text-caption text-muted">{open ? "닫기" : "열기"}</span>
      </button>

      {open && (
        <form action={formAction} className="border-t border-line px-4 py-4">
          {/* 킬스위치 — 가장 위. 사고 시 여기부터 찾는다 */}
          <div className="rounded-xl border border-line bg-bg p-3">
            <label className="flex cursor-pointer items-center gap-2 text-body-sm font-semibold">
              <input
                type="checkbox"
                name="enabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              봇 응답 사용
            </label>
            <p className="mt-1 text-caption text-muted">
              끄면 <b className="text-fg">모든 작가</b>의 봇이 답을 멈추고 “작가님께 그대로 전달드릴게요”로만
              받아요. 손님 질문은 그대로 기록되고 작가에게 넘어갑니다 — 대화가 끊기지는 않아요.
            </p>
          </div>

          <label className="mt-4 flex flex-col gap-1">
            <span className="text-caption text-muted">
              사매 공통 정책 — 모든 작가 봇 프롬프트에 주입돼요 (비우면 코드 기본값)
            </span>
            <textarea
              name="policyText"
              defaultValue={props.policyText}
              rows={8}
              spellCheck={false}
              placeholder={props.fallbackPolicy}
              className="rounded-lg border border-line bg-bg px-3 py-2 font-mono text-caption leading-relaxed outline-none focus:border-fg/40"
            />
          </label>
          <p className="mt-1 text-caption text-faint">
            작가별 사실(가격·보정·환불)은 아래 KB 카드가 담당해요. 여기에는 “사매라는 서비스가 어떻게
            굴러가는가”만 둡니다. 현재 버전 v{props.policyVersion} — 내용을 바꾸면 자동으로 올라가요.
          </p>

          <label className="mt-4 flex flex-col gap-1">
            <span className="text-caption text-muted">
              기본 말투 — 작가가 스튜디오에서 따로 정하지 않았을 때만 쓰여요
            </span>
            <input
              name="defaultTone"
              defaultValue={props.defaultTone}
              placeholder="따뜻하고 간결한 존댓말. 이모지는 쓰지 않는다."
              className="rounded-lg border border-line bg-bg px-3 py-2 text-body-sm outline-none focus:border-fg/40"
            />
          </label>

          <label className="mt-3 flex flex-col gap-1">
            <span className="text-caption text-muted">모델 (비우면 기본값)</span>
            <input
              name="model"
              defaultValue={props.model}
              placeholder={props.fallbackModel}
              spellCheck={false}
              className="rounded-lg border border-line bg-bg px-3 py-2 font-mono text-caption outline-none focus:border-fg/40"
            />
          </label>

          {/* 고정 메시지 — 봇이 늘 같은 문장으로 말하는 자리들 */}
          <div className="mt-5 rounded-xl border border-line bg-bg p-3">
            <p className="text-caption font-semibold text-fg">고정 메시지</p>
            <p className="mt-1 text-caption text-muted">
              봇이 늘 같은 문장으로 말하는 자리예요. 비우면 기본 문구가 쓰입니다.{" "}
              <code className="rounded bg-fg/[0.08] px-1">{PHOTOGRAPHER_TOKEN}</code> 은 작가 이름으로
              바뀝니다.
            </p>

            <MsgField
              label="봇 이름 — 말풍선에 뜨는 이름"
              name="botName"
              defaultValue={props.botName}
              placeholder={DEFAULT_MESSAGES.botName}
            />
            <MsgField
              label="첫 인사 — 작가별 인사말이 있으면 그게 우선이에요"
              name="msgGreeting"
              defaultValue={props.msgGreeting}
              placeholder={DEFAULT_MESSAGES.greeting}
              rows={3}
            />
            <MsgField
              label="작가 입장 안내 — 작가가 대화에 들어온 순간"
              name="msgHandoff"
              defaultValue={props.msgHandoff}
              placeholder={DEFAULT_MESSAGES.handoff}
              rows={2}
            />
            <MsgField
              label="답할 근거가 없을 때 — KB 미등록이거나 봇을 꺼둔 경우"
              name="msgNoAnswer"
              defaultValue={props.msgNoAnswer}
              placeholder={DEFAULT_MESSAGES.noAnswer}
              rows={2}
            />
            <MsgField
              label="오류 — LLM 응답 실패"
              name="msgError"
              defaultValue={props.msgError}
              placeholder={DEFAULT_MESSAGES.error}
              rows={2}
            />
          </div>

          {state.error && <p className="mt-3 text-caption text-danger">{state.error}</p>}
          {state.ok && !state.error && (
            <p className="mt-3 text-caption text-success">저장했어요 — 다음 응답부터 바로 적용돼요.</p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <SaveButton />
            {props.updatedAt && (
              <span className="text-caption text-faint">
                최근 저장 {new Date(props.updatedAt).toLocaleString("ko-KR")}
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function MsgField({
  label,
  name,
  defaultValue,
  placeholder,
  rows,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder: string;
  rows?: number;
}) {
  return (
    <label className="mt-3 flex flex-col gap-1">
      <span className="text-caption text-muted">{label}</span>
      {rows ? (
        <textarea
          name={name}
          defaultValue={defaultValue}
          rows={rows}
          placeholder={placeholder}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-body-sm leading-relaxed outline-none focus:border-fg/40"
        />
      ) : (
        <input
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-body-sm outline-none focus:border-fg/40"
        />
      )}
    </label>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="cursor-pointer rounded-lg bg-fg px-4 py-2 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "저장 중…" : "정책 저장"}
    </button>
  );
}
