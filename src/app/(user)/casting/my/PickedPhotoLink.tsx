"use client";

import Image from "next/image";
import Link from "next/link";
import { mpTrack } from "@/lib/mixpanel";

/**
 * 신청 때 고른 사진 → 사진 상세.
 *
 * 이 클릭이 캐스팅 퍼널의 **2차 KPI 그 자체**다.
 * 선정 인원은 회차당 소수고 탈락자가 다수인데, 탈락자가 여기를 눌러 서비스로 돌아오면
 * 퍼널이 목적을 달성한 것이다. 그래서 판정 결과(status)를 함께 실어
 * "탈락자가 실제로 돌아오는가"를 분리해서 볼 수 있게 한다.
 */
export function PickedPhotoLink({
  photoId,
  url,
  photographerName,
  applicationStatus,
}: {
  photoId: string;
  url: string;
  photographerName: string;
  applicationStatus: string;
}) {
  return (
    <Link
      href={`/photos/${photoId}`}
      className="group w-20 shrink-0"
      onClick={() =>
        mpTrack("Casting To Photo", {
          photo_id: photoId,
          application_status: applicationStatus,
          source: "casting_my",
        })
      }
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-line">
        <Image src={url} alt="" fill sizes="80px" className="object-cover transition-transform group-hover:scale-105" />
      </div>
      <p className="mt-1 truncate text-[10px] text-fg/50">{photographerName}</p>
    </Link>
  );
}
