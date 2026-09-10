"use client";

// 새 메시지 알림 — 앱을 켜둔 채 다른 화면에 있을 때 채팅이 온 걸 알려준다.
//
// 배지만으로는 부족하다. 배지는 '어딘가에 안 읽은 게 있다' 는 사실만 말하고,
// 누가 뭐라고 했는지는 들어가 봐야 안다. 그래서 답장이 늦어진다 — 고객은 그동안 다른 작가에게 간다.
// 여기서는 상대 이름과 첫 줄까지 띄우고, 누르면 그 방으로 바로 들어간다.
//
// 띄우지 않는 경우:
//   · 내가 보낸 메시지
//   · 지금 그 방을 보고 있을 때 (같은 내용이 화면에 이미 있다)
// 탭이 뒤에 있으면 토스트 대신 브라우저 탭 제목에 개수를 붙인다. 다른 탭에서 일하다가도 보인다.

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { previewIncoming, type ChatNotice } from "@/app/actions/chat-notify";
import { Avatar } from "@/components/ui";

/** 화면에 동시에 띄우는 최대 개수 — 그 이상은 쌓아봐야 읽히지 않는다 */
const MAX_VISIBLE = 3;
/** 자동으로 사라지기까지 */
const DISMISS_MS = 6000;

type Toast = ChatNotice & { key: number };

export function ChatToast({ meId }: { meId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Toast[]>([]);

  // 지금 보고 있는 방 — 구독 콜백이 경로가 바뀔 때마다 다시 붙지 않게 ref 로 읽는다
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  // 탭 제목 배지 — 탭이 뒤에 있는 동안 쌓인 개수
  const hiddenCount = useRef(0);

  useEffect(() => {
    const BADGE = /^\(\d+\)\s/;
    const paintTitle = () => {
      const base = document.title.replace(BADGE, "");
      const n = hiddenCount.current;
      const next = n > 0 ? `(${n}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };

    // 새 메시지는 목록 갱신(router.refresh)도 함께 일으키고, 그때 Next 가 메타데이터로
    // 제목을 다시 쓴다. 그대로 두면 배지가 붙자마자 지워진다.
    // <title> 엘리먼트 자체가 통째로 갈리므로 그 노드가 아니라 head 를 본다.
    const observer = new MutationObserver(() => {
      if (hiddenCount.current > 0) paintTitle();
    });
    observer.observe(document.head, { childList: true, characterData: true, subtree: true });

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      hiddenCount.current = 0;
      paintTitle();
    };
    document.addEventListener("visibilitychange", onVisible);

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const onInsert = async (row: { id?: string; conversation_id?: string; sender_id?: string }) => {
      if (!row?.id || row.sender_id === meId) return;

      // 탭이 뒤에 있으면 제목으로 알린다 — 그 방을 열어둔 채 다른 탭에 가 있을 수도 있다
      if (document.visibilityState !== "visible") {
        hiddenCount.current += 1;
        paintTitle();
      }

      // 지금 그 방을 보고 있으면 토스트는 띄우지 않는다 (메시지가 이미 화면에 있다)
      const inThisRoom = pathRef.current === `/chat/${row.conversation_id}`;
      if (inThisRoom && document.visibilityState === "visible") return;

      const notice = await previewIncoming(row.id);
      if (cancelled || !notice) return;

      setToasts((prev) => {
        // 같은 방의 이전 알림은 최신 것으로 갈아끼운다 — 한 사람이 여러 줄 보내면 줄줄이 쌓인다
        const rest = prev.filter((t) => t.conversationId !== notice.conversationId);
        return [...rest, { ...notice, key: Date.now() + Math.random() }].slice(-MAX_VISIBLE);
      });
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel("chat-toast")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            void onInsert(payload.new as { id?: string; conversation_id?: string; sender_id?: string });
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      observer?.disconnect();
      hiddenCount.current = 0;
      document.title = document.title.replace(BADGE, "");
      if (channel) supabase.removeChannel(channel);
    };
  }, [meId]);

  // 오래된 것부터 저절로 사라진다
  useEffect(() => {
    if (toasts.length === 0) return;
    const oldest = toasts[0];
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.key !== oldest.key));
    }, DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toasts]);

  const open = (t: Toast) => {
    setToasts((prev) => prev.filter((x) => x.key !== t.key));
    router.push(`/chat/${t.conversationId}`);
  };

  if (toasts.length === 0) return null;

  return (
    <div
      // 노치 아래로 — 상태바에 가리면 누구한테 온 건지가 안 보인다
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] font-kr"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => open(t)}
          className="chat-toast pointer-events-auto flex w-full max-w-sm cursor-pointer items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-pop ring-1 ring-line"
        >
          <Avatar src={t.avatarUrl} name={t.title} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body-sm font-semibold text-fg">{t.title}</span>
            <span className="block truncate text-caption text-muted">{t.preview}</span>
          </span>
          <span className="shrink-0 rounded-full bg-fg px-2.5 py-1 text-caption font-semibold text-bg">
            열기
          </span>
        </button>
      ))}
    </div>
  );
}
