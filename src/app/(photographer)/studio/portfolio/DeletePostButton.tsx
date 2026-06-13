"use client";

import { deletePost } from "./actions";

// 게시물(피드) 삭제 — 여러 장이 함께 지워지므로 확인 후 진행.
export function DeletePostButton({ albumId, count }: { albumId: string; count: number }) {
  return (
    <form
      action={deletePost}
      onSubmit={(e) => {
        if (!confirm(`이 게시물(사진 ${count}장)을 삭제할까요? 되돌릴 수 없어요.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="album_id" value={albumId} />
      <button className="rounded-full px-3 py-1 text-xs text-brand hover:bg-brand/[0.06]">
        게시물 삭제
      </button>
    </form>
  );
}
