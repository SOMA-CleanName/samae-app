"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function OwnerPhotoBackButton() {
  const router = useRouter();

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/studio");
  }

  return (
    <Button type="button" variant="secondary" size="lg" fullWidth className="mt-6" onClick={goBack}>
      내 사진입니다 — 뒤로 가기
    </Button>
  );
}
