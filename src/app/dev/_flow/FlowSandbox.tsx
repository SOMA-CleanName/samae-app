"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApplyFormBody, ApplyPendingBody } from "@/app/(user)/apply/ApplyBodies";
import { applyFieldErrors, parseApplyForm, type ApplyLeadState } from "@/app/(user)/apply/schema";
import { ConsentBody } from "@/app/(auth)/signup/consent/ConsentBody";
import ContactForm from "@/app/(auth)/signup/contact/ContactForm";
import type { RequestCodeState, VerifyCodeState } from "@/app/(auth)/signup/contact/actions";
import { AgreeGate } from "@/app/(photographer)/studio/AgreeGate";
import { PHOTOGRAPHER_AGREEMENT_VERSIONS } from "@/lib/policy-version";
import type { BusinessType } from "@/lib/platform-fee";
import { readFlow, resetFlow, stagePath, writeFlow, EMPTY, type FlowState, type FlowStage } from "./store";

// 샌드박스의 클라이언트 섬들 — **화면은 전부 실제 컴포넌트**이고 여기서는 액션만 갈아 끼운다.
//
// 지면 자체는 page.tsx(서버 컴포넌트)가 그린다. 그래야 가입 지면의 AuthShell(사진 벽을
// DB 에서 읽는 async 서버 컴포넌트)을 진짜로 쓸 수 있다. 처음엔 전부 클라이언트로 만들어
// 그 화면을 손으로 흉내 냈는데, 그러면 **실제와 다른 화면을 QA 하게 된다.**

/** 샌드박스 인증번호 — 문자를 안 보내므로 고정값을 화면에 적어 둔다 */
export const SANDBOX_OTP = "000000";

/**
 * `]` `[` 가 도는 **정규 흐름**.
 *
 * ⚠️ **약관·연락처가 여기 없다.** 카카오 간편가입이 켜진 뒤로 그 둘은 카카오 동의
 *    화면에서 한 번에 받는다 — `/auth/callback` 이 `adoptKakaoServiceTerms()` 와
 *    `adoptKakaoPhone()` 으로 우리 기록에 옮기고, 그러면 `needsTermsConsent` ·
 *    `needsContact` 가 false 가 되어 두 화면을 **건너뛴다.**
 *
 *    정규 단계로 나열해 두면 **실제로는 안 보이는 화면을 온보딩 문서가 설명하게 된다.**
 *    그래서 흐름에서 뺐다. 다만 지우지는 않았다 — 아래 조건에서 진짜로 뜨는 폴백이다.
 *      · 전화번호(선택 동의)를 거부한 사람 → /signup/contact
 *      · service_terms 조회 실패·타임아웃(4초), KAKAO_TERMS_TAGS 설정 오류
 *      · 간편가입을 켜기 전에 가입한 기존 회원 → 다음 로그인에 /signup/consent
 *    `?stage=consent` · `?stage=contact` 로 직접 열면 그대로 볼 수 있다.
 */
const STAGES: { key: FlowStage; label: string }[] = [
  { key: "intro", label: "① 안내" },
  { key: "signup", label: "② 가입" },
  { key: "form", label: "③ 신청 폼" },
  { key: "pending", label: "④ 승인 대기" },
  { key: "agree", label: "⑤ 입점 동의" },
  { key: "done", label: "⑥ 완료" },
];

/**
 * 단계 이동은 라우팅으로 — 서버가 그 단계의 진짜 지면을 그려야 한다.
 *
 * `next=/apply` 를 같이 달고 다닌다. 가입·로그인 지면의 표제는 **어디서 왔는지(next)에
 * 따라 달라지는데**(SignupHeadline → "작가로 시작하기"), 이걸 빼면 샌드박스만 손님용
 * 카피("사진부터 고르고…")를 보여준다 — 실제 작가 경로와 다른 화면이 된다.
 */
function useGo() {
  const router = useRouter();
  return (stage: FlowStage) => {
    // 단계마다 사는 라우트가 다르다 — store 의 stagePath 참고
    router.push(stagePath(stage));
    router.refresh();
  };
}

/** localStorage 는 서버에 없다 — 마운트 후에 읽는다 */
function useFlow(): FlowState {
  const [flow, setFlow] = useState<FlowState>(EMPTY);
  useEffect(() => {
    const sync = () => setFlow(readFlow());
    const frame = requestAnimationFrame(sync);
    window.addEventListener("samae:dev-flow", sync);
    window.addEventListener("storage", sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("samae:dev-flow", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return flow;
}

// ── 단계 이동 — **화면에 아무것도 그리지 않는다** ──────────────
//
// 전에는 상단에 단계 막대를 띄웠는데, 그게 지면을 밀어내서 **실제 화면과 좌표가 달라졌다.**
// QA 의 목적이 "실제와 같은 화면을 보는 것" 인데 도구가 그걸 망치고 있었다.
// 지금은 키보드로만 움직인다: `]` 다음 · `[` 이전 · `0` 처음으로.
export function FlowKeys({ stage }: { stage: FlowStage }) {
  const go = useGo();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 입력 중에는 가로채지 않는다 — 폼에 `]` 를 칠 수도 있다
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = STAGES.findIndex((x) => x.key === stage);
      if (e.key === "]") go(STAGES[Math.min(i + 1, STAGES.length - 1)].key);
      else if (e.key === "[") go(STAGES[Math.max(i - 1, 0)].key);
      else if (e.key === "0") {
        resetFlow();
        go(STAGES[0].key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, go]);
  return null;
}

// ── ① 안내 — 실제 ApplyIntro 를 그대로 받아 감싸기만 한다 ────────
export function SandboxIntroShim({ children }: { children: ReactNode }) {
  const go = useGo();
  return (
    <div
      // ApplyIntro 의 [작가 신청 시작하기]·[이미 계정이 있어요] 는 /signup·/login 으로 나간다.
      // 샌드박스 밖으로 나가면 안 되므로 클릭만 가로챈다. 화면은 손대지 않는다.
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (!a) return;
        const href = a.getAttribute("href") ?? "";
        if (href.startsWith("/signup") || href.startsWith("/login")) {
          e.preventDefault();
          go("signup");
        }
      }}
    >
      {children}
    </div>
  );
}

// ② 가입은 샌드박스가 감싸지 않는다 — 실제 SignupForm 을 페이지가 직접 쓴다.
//    카카오 버튼도 **진짜 OAuth 로 나간다**(온보딩 문서용 실제 화면 촬영 때문).
//    돌아오는 곳은 ?next 가 정한다(=/apply) — 그때부터는 실제 흐름이다.

// ── ③ 약관 — 실제 ConsentBody ────────────────────────────────
export function SandboxConsent({ termsVersion }: { termsVersion: string }) {
  const go = useGo();
  const action = async (fd: FormData): Promise<void> => {
    if (fd.get("terms") !== "on" || fd.get("privacy") !== "on") {
      throw new Error("서비스 이용약관과 개인정보 처리방침에 모두 동의해야 계속할 수 있어요.");
    }
    const prev = readFlow();
    writeFlow({
      ...prev,
      stage: "contact",
      signup: {
        agreedTerms: true,
        agreedPrivacy: true,
        phone: prev.signup?.phone ?? "",
        at: new Date().toISOString(),
      },
    });
    go("contact");
  };
  return (
    <ConsentBody next="/apply" termsVersion={termsVersion} displayName="QA작가" action={action} />
  );
}

// ── ④ 연락처 — 실제 ContactForm, OTP 만 교체(문자 안 나감) ───────
export function SandboxContact() {
  const go = useGo();
  const requestAction = async (
    _p: RequestCodeState | null,
    fd: FormData
  ): Promise<RequestCodeState> => {
    const raw = String(fd.get("phone") ?? "").replace(/\D/g, "");
    if (raw.length < 10) return { ok: false, error: "휴대폰 번호를 정확히 입력해주세요." };
    // devCode 는 실제 액션도 dev 스텁 발송에서 쓰는 필드 — 화면이 그대로 코드를 보여준다
    return { ok: true, error: null, phone: raw, devCode: SANDBOX_OTP };
  };
  const verifyAction = async (
    _p: VerifyCodeState | null,
    fd: FormData
  ): Promise<VerifyCodeState> => {
    if (String(fd.get("code") ?? "") !== SANDBOX_OTP) {
      return { ok: false, error: "인증번호가 올바르지 않아요." };
    }
    const prev = readFlow();
    writeFlow({
      ...prev,
      signup: {
        agreedTerms: prev.signup?.agreedTerms ?? true,
        agreedPrivacy: prev.signup?.agreedPrivacy ?? true,
        phone: String(fd.get("phone") ?? ""),
        at: prev.signup?.at ?? new Date().toISOString(),
      },
    });
    return { ok: true, error: null };
  };
  // 인증번호는 실제 ContactForm 이 `dev 코드:` 로 스스로 보여준다(devCode 필드).
  // 우리가 따로 안내를 덧붙이면 그만큼 실제 화면과 달라진다.
  return (
    <>
      <ContactForm
        next="/apply"
        displayName="QA작가"
        requestAction={requestAction}
        verifyAction={verifyAction}
        onDone={() => go("form")}
      />
    </>
  );
}

// ── ⑤ 신청 폼 — 실제 ApplyFormBody ───────────────────────────
export function SandboxApply({ kakaoChannelUrl }: { kakaoChannelUrl: string }) {
  const action = async (_prev: ApplyLeadState, fd: FormData): Promise<ApplyLeadState> => {
    const parsed = parseApplyForm(fd);
    if (!parsed.success) {
      return { error: "입력값을 확인해주세요.", fieldErrors: applyFieldErrors(parsed.error.issues) };
    }
    const v = parsed.data;
    writeFlow({
      ...readFlow(),
      stage: "pending",
      application: {
        displayName: v.displayName,
        portfolioUrl: v.portfolioUrl,
        phone: v.phone,
        bio: v.bio ?? "",
        submittedAt: new Date().toISOString(),
      },
    });
    // 실제로도 여기서 화면을 옮기지 않는다 — 폼 자리에 "접수됐어요" 가 뜨고 카카오 채널
    // 단계가 남는다. 그 화면까지 보고 막대로 ⑥ 으로 넘어간다.
    return { ok: true };
  };
  return <ApplyFormBody kakaoChannelUrl={kakaoChannelUrl} action={action} />;
}

// ── ⑥ 승인 대기 — 실제 ApplyPendingBody + 운영자 역할 버튼 ──────
export function SandboxPendingShim({ kakaoChannelUrl }: { kakaoChannelUrl: string }) {
  const flow = useFlow();
  // 실제로는 어드민이 승인해야 다음으로 간다. 그 버튼을 여기 두면 실제 화면과 달라지므로
  // 화면에는 아무것도 덧붙이지 않고 `]` 키로 넘어간다.
  return (
    <ApplyPendingBody
      displayName={flow.application?.displayName ?? "QA작가"}
      kakaoChannelUrl={kakaoChannelUrl}
    />
  );
}

// ── ⑦ 입점 동의 — 실제 AgreeGate ─────────────────────────────
export function SandboxAgree() {
  const go = useGo();
  const flow = useFlow();
  const submit = async (fd: FormData): Promise<void> => {
    // 실제 액션과 같은 조건으로 막는다 — 문서별 열람 증적이 없으면 거절
    for (const key of ["contract", "terms", "fee", "refund"]) {
      if (fd.get(`agree_${key}`) !== "on") throw new Error("문서 4종에 모두 동의해야 해요.");
    }
    let docRecords: Record<string, { openedAt?: string; agreedAt?: string }> = {};
    try {
      docRecords = JSON.parse(String(fd.get("docRecords") ?? ""));
    } catch {
      throw new Error("열람 기록이 없어요. 문서를 전문으로 읽고 다시 동의해주세요.");
    }
    for (const key of ["contract", "terms", "fee", "refund"]) {
      if (!docRecords[key]?.openedAt || !docRecords[key]?.agreedAt) {
        throw new Error("문서를 전문으로 읽어야 동의할 수 있어요.");
      }
    }
    const legalName = String(fd.get("legalName") ?? "").trim();
    const businessType = String(fd.get("businessType") ?? "");
    if (!legalName) throw new Error("성명 또는 상호를 입력해주세요.");
    if (!businessType) throw new Error("사업자 유형을 선택해주세요.");
    writeFlow({
      ...readFlow(),
      stage: "done",
      agreement: {
        versions: { ...PHOTOGRAPHER_AGREEMENT_VERSIONS },
        legalName,
        businessType,
        businessNo: String(fd.get("businessNo") ?? ""),
        promoConsent: fd.get("promoConsent") === "on",
        agreedAt: new Date().toISOString(),
        docRecords,
      },
    });
    go("done");
  };
  return (
    <AgreeGate
      displayName={flow.application?.displayName ?? "QA작가"}
      initial={{
        legalName: "",
        businessType: "" as BusinessType | "",
        businessNo: "",
        promoConsent: false,
      }}
      reason="first"
      submit={submit}
    />
  );
}

// ── ⑧ 완료 — 샌드박스 전용 요약(실제에는 없는 화면) ─────────────
export function SandboxDone() {
  const go = useGo();
  const flow = useFlow();
  const g = flow.agreement;
  return (
    <main className="mx-auto max-w-lg px-3.5 py-10 font-kr sm:px-5">
      <h1 className="text-2xl font-semibold">동의 완료</h1>
      <p className="mt-2 text-sm text-muted">
        실제라면 여기서 스튜디오가 열립니다. 아래는{" "}
        <b className="font-semibold text-fg">이번 회차에 기록됐을</b> 내용이에요.
      </p>

      <Block title="가입">
        <Row k="약관 동의" v={flow.signup?.agreedTerms ? "O" : "—"} />
        <Row k="처리방침" v={flow.signup?.agreedPrivacy ? "O" : "—"} />
        <Row k="연락처" v={flow.signup?.phone || "—"} />
        <Row k="시각" v={flow.signup?.at} />
      </Block>

      <Block title="신청서">
        <Row k="작가명" v={flow.application?.displayName} />
        <Row k="포트폴리오" v={flow.application?.portfolioUrl} />
        <Row k="전화번호" v={flow.application?.phone} />
        <Row k="소개" v={flow.application?.bio || "—"} />
      </Block>

      <Block title="입점 동의 기록">
        <Row k="성명/상호" v={g?.legalName} />
        <Row k="사업자 유형" v={g?.businessType} />
        <Row k="사업자번호" v={g?.businessNo || "—"} />
        <Row k="홍보 동의" v={g?.promoConsent ? "O" : "X"} />
        <Row k="동의 시각" v={g?.agreedAt} />
        <Row k="버전" v={g ? JSON.stringify(g.versions) : "—"} />
      </Block>

      <Block title="문서별 열람·동의 증적">
        {g?.docRecords
          ? Object.entries(g.docRecords).map(([k, v]) => (
              <Row key={k} k={k} v={`읽음 ${v.openedAt?.slice(11, 19)} · 동의 ${v.agreedAt?.slice(11, 19)}`} />
            ))
          : <Row k="—" v="없음" />}
      </Block>

      <button
        type="button"
        onClick={() => {
          resetFlow();
          go("intro");
        }}
        className="mt-8 w-full cursor-pointer rounded-xl border border-line-strong py-3 text-sm font-medium transition-colors hover:bg-fg/[0.04]"
      >
        처음부터 다시
      </button>
    </main>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-line p-4">
      <p className="text-sm font-semibold">{title}</p>
      <dl className="mt-2.5 flex flex-col gap-1.5">{children}</dl>
    </section>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex gap-3 text-xs">
      <dt className="w-20 shrink-0 text-faint">{k}</dt>
      <dd className="min-w-0 flex-1 break-all">{v ?? "—"}</dd>
    </div>
  );
}
