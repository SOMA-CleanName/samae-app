#!/bin/bash
# 임베딩 배치 실행 래퍼 — launchd 가 매일 호출한다. (docs/22 §7.4)
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

{
  echo "=== 임베딩 배치 시작 $(date '+%F %T') ==="
  if [ ! -x "$VENV" ]; then
    echo "❌ venv 없음: $VENV — macmini-setup.sh 를 먼저 실행하세요."
    exit 1
  fi
  cd "$ROOT" || exit 1
  "$VENV" scripts/embed/embed_photos.py --apply || exit 1

  # 톤 벡터(7단계 · docs/22 §7.6)는 임베딩이 채워진 뒤에만 의미가 있다.
  # tone_backfill 은 tone_vec 이 비고 embedding 이 있는 사진만 보므로,
  # 위 단계에서 새로 채워진 사진이 그대로 이어서 처리된다.
  echo
  echo "--- 톤 백필 ---"
  "$VENV" scripts/embed/tone_backfill.py --apply
} >>"$LOG" 2>&1
STATUS=$?

# 커버리지 줄은 스크립트가 DB 를 다시 조회해 찍는 값이라 신뢰할 수 있다.
COVERAGE="$(grep -m1 '^커버리지' "$LOG" || true)"

if [ $STATUS -ne 0 ]; then
  notify "⚠️ **임베딩 배치 실패** (맥미니)
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
