"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, markRead } from "../actions";
import type { ChatMessage } from "@/lib/chat";

export function ChatRoom({
  conversationId,
  meId,
  initialMessages,
}: {
  conversationId: string;
  meId: string;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 안읽음 초기화
  useEffect(() => {
    markRead(conversationId);
  }, [conversationId]);

  // Realtime 구독 — 새 메시지 수신
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // RLS가 적용되는 postgres_changes 구독을 위해 realtime 토큰 보장
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);

      channel = supabase
        .channel(`messages:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const m = payload.new as ChatMessage;
            setMessages((prev) =>
              prev.some((x) => x.id === m.id) ? prev : [...prev, m]
            );
            if (m.sender_id !== meId) markRead(conversationId);
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [conversationId, meId]);

  // 새 메시지 시 스크롤 하단
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    startTransition(() => {
      sendMessage(conversationId, t);
    });
  }

  async function onFile(files: FileList | null) {
    if (!files?.[0]) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", files[0]);
    fd.append("conversationId", conversationId);
    await fetch("/api/chat/upload", { method: "POST", body: fd });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex h-[calc(100svh-8rem)] flex-col">
      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-2">
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-fg text-bg" : "bg-fg/[0.07] text-fg"
                }`}
              >
                {m.type === "image" && m.image_path ? (
                  <img
                    src={m.image_path}
                    alt=""
                    className="max-h-60 rounded-lg"
                    loading="lazy"
                  />
                ) : (
                  <span className="whitespace-pre-wrap break-words">{m.body}</span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 입력 */}
      <form onSubmit={onSend} className="flex items-center gap-2 border-t border-fg/8 py-3">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files)} />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="shrink-0 rounded-full bg-fg/[0.06] px-3 py-2 text-sm hover:bg-fg/10 disabled:opacity-50"
          aria-label="사진 보내기"
        >
          {uploading ? "…" : "📷"}
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지"
          className="flex-1 rounded-full border border-fg/15 bg-white px-4 py-2 text-sm outline-none focus:border-fg/40"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
        >
          전송
        </button>
      </form>
    </div>
  );
}
