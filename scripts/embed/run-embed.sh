#!/bin/bash
# 임베딩·목적 태그·무드 검색 목록·세부분류/성별 초안 배치 — launchd 가 매일 06:00 호출한다. (docs/28)
#
# 하는 일
#   1) 저장소 위치를 스스로 찾아 venv 파이썬으로 배치를 돌린다
#   2) 로그를 남기고 오래된 것은 지운다
#   3) 실패하면 디스코드로 알린다
#
# 성공은 알리지 않는다. 매일 성공 알림이 오면 사람이 읽지 않게 되고, 그러면
# 진짜 실패도 묻힌다. "기계가 꺼져서 배치 자체가 안 도는" 경우는 이 스크립트가
# 감지할 수 없으므로(꺼졌으니 알림도 못 보낸다) daily-digest 의 '임베딩 대기'
# 수치로 감시한다.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV="$ROOT/scripts/embed/.venv/bin/python"
LOG_DIR="$ROOT/scripts/embed/logs"
LOCK="$LOG_DIR/.running"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/embed-$STAMP.log"

mkdir -p "$LOG_DIR"

# 겹쳐 도는 것 방지 — 앞 회차가 길어졌을 때 두 개가 같은 행을 갱신하지 않게.
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "이전 실행이 아직 돌고 있어 건너뜁니다: $(cat "$LOCK/pid" 2>/dev/null)" | tee -a "$LOG"
  exit 0
fi
echo $$ > "$LOCK/pid"
cleanup() { rm -rf "$LOCK"; }
trap cleanup EXIT

notify() {  # $1 = 메시지
  local url
  url="$(grep -m1 '^DISCORD_OPS_WEBHOOK_URL=' "$ROOT/.env.local" 2>/dev/null | cut -d= -f2-)"
  [ -z "${url:-}" ] && return 0
  curl -s -m 20 -H 'Content-Type: application/json' \
    -d "$(printf '{"content":%s}' "$(printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")" \
    "$url" >/dev/null 2>&1 || true
}

(
  echo "=== 임베딩·목적 배치 시작 $(date '+%F %T') ==="
  if [ ! -x "$VENV" ]; then
    echo "❌ venv 없음: $VENV — macmini-setup.sh 를 먼저 실행하세요."
    exit 1
  fi
  cd "$ROOT" || exit 1
  # 검색과 같은 모델을 공유한다. 서버 장애 시 독립 모델로 우회하지 않는다.
  echo "[1/4] 사진 유사도 임베딩"
  "$VENV" scripts/embed/embed_photos.py --apply --embed-url http://127.0.0.1:8077
  EMBED_STATUS=$?
  # 사진 일부가 실패해도 저장된 임베딩으로 목적·검수 상속은 계속 처리한다.
  echo "[2/4] 목적 태그 · 신규/미처리 포트폴리오"
  "$VENV" scripts/embed/purpose_backfill.py --apply --daily --embed-url http://127.0.0.1:8077 \
    --output "$LOG_DIR/purpose-latest"
  PURPOSE_STATUS=$?
  # 백필이 끝난 뒤 무드 태그 검색용 사진 목록을 새로 만든다(0138, docs/29 §12.15).
  # 앞 단계가 실패해도 만든다 — 목록은 사진 태그·공개 여부만 담아 임베딩과 상관없다.
  echo "[3/4] 무드 태그 검색 목록"
  "$VENV" scripts/embed/build_search_tags.py --apply
  TAGS_STATUS=$?
  # 목적이 정해진 뒤에 그 목적 안의 세부분류 · 개인 성별 초안을 채운다(비어 있는 것만, docs/39 §7.4).
  # 앞 단계가 일부 실패해도 이미 저장된 목적으로 계속한다.
  echo "[4/4] 세부분류 · 성별 초안 · 비어 있는 포트폴리오"
  "$VENV" scripts/embed/purpose_drafts.py --apply --daily --embed-url http://127.0.0.1:8077
  DRAFT_STATUS=$?
  echo "단계별 종료 코드: 임베딩=$EMBED_STATUS 목적=$PURPOSE_STATUS 검색목록=$TAGS_STATUS 초안=$DRAFT_STATUS"
  # 초안은 검수 전 보조 값이라 실패해도 배치를 실패로 보지 않는다 — 디스코드로 알리지 않고 로그에만 남긴다.
  # 다음 날 비어 있는 것을 다시 채우므로 하루 늦어질 뿐이다.
  [ "$DRAFT_STATUS" -eq 0 ] || echo "⚠️ 초안 단계 실패(종료 코드 $DRAFT_STATUS) — 알리지 않음, 로그 확인"
  [ "$EMBED_STATUS" -eq 0 ] || exit "$EMBED_STATUS"
  [ "$PURPOSE_STATUS" -eq 0 ] || exit "$PURPOSE_STATUS"
  exit "$TAGS_STATUS"
) >>"$LOG" 2>&1
STATUS=$?

# 커버리지 줄은 스크립트가 DB 를 다시 조회해 찍는 값이라 신뢰할 수 있다.
COVERAGE="$(grep -m1 '^커버리지' "$LOG" || true)"

if [ $STATUS -ne 0 ]; then
  notify "⚠️ **임베딩·목적 배치 실패** (맥미니)
종료코드 \`$STATUS\`
\`\`\`
$(tail -n 15 "$LOG")
\`\`\`"
else
  echo "=== 완료 $(date '+%F %T') · $COVERAGE ===" >>"$LOG"
fi

# 로그는 최근 14개만 남긴다.
ls -1t "$LOG_DIR"/embed-*.log 2>/dev/null | tail -n +15 | xargs -I{} rm -f {} 2>/dev/null

exit $STATUS
