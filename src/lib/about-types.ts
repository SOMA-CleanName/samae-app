// 소개(무드) 섹션 타입 — 서버/클라이언트 공용 (편집기 실시간 미리보기에서도 사용)

// 소개 섹션에 들어가는 이미지 — 업로드 시점에 굽는 메인/썸네일 URL 저장
export type AboutImage = {
  url: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
};

// 섹션별 텍스트 스타일 — 미지정 필드는 섹션 타입별 기본값을 따른다
export type AboutTextStyle = {
  size?: "sm" | "md" | "lg";
  color?: "ink" | "soft" | "faint" | "brand";
  bold?: boolean;
  align?: "left" | "center" | "right";
};

// 텍스트 컬럼 — 일반 단락 또는 인용구(세로 바 강조). 컬럼마다 개별 스타일 가능.
export type AboutColumn = {
  kind: "text" | "quote";
  text: string;
  style?: AboutTextStyle;
};

export type AboutSectionContent = {
  heading: { text: string; style?: AboutTextStyle };
  text: { text: string; style?: AboutTextStyle };
  text_columns: { left: AboutColumn; right: AboutColumn };
  quote: { text: string; style?: AboutTextStyle };
  image_full: { image: AboutImage | null; caption: string };
  image_pair: { images: [AboutImage | null, AboutImage | null] };
  image_text: {
    image: AboutImage | null;
    text: string;
    imageSide: "left" | "right";
    style?: AboutTextStyle;
  };
};

export type AboutSectionType = keyof AboutSectionContent;

export type AboutSection = {
  [T in AboutSectionType]: {
    id: string;
    type: T;
    content: AboutSectionContent[T];
    sort_order: number;
  };
}[AboutSectionType];

export const ABOUT_SECTION_TYPES: AboutSectionType[] = [
  "heading",
  "text",
  "text_columns",
  "quote",
  "image_full",
  "image_pair",
  "image_text",
];

// 섹션에 실제 노출할 내용이 있는지 — 빈 껍데기 섹션은 공개 페이지에서 숨긴다
export function sectionHasContent(s: AboutSection): boolean {
  switch (s.type) {
    case "heading":
    case "text":
      return !!s.content.text?.trim();
    case "text_columns":
      return !!(s.content.left?.text?.trim() || s.content.right?.text?.trim());
    case "quote":
      return !!s.content.text?.trim();
    case "image_full":
      return !!s.content.image?.url;
    case "image_pair":
      return (s.content.images ?? []).some((img) => !!img?.url);
    case "image_text":
      return !!(s.content.image?.url || s.content.text?.trim());
    default:
      return false;
  }
}
