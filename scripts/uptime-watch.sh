#!/bin/bash
# 사매 살아있나 — 맥미니에서 5분마다 외부에서 찔러본다.
#
# **왜 맥미니인가**: Vercel 크론으로 자기 사이트를 찌르면 사이트가 죽을 때 크론도 같이
# 죽어서 아무 소리도 안 난다. 감시는 밖에서 해야 뜻이 있다. 맥미니는 안 꺼진다.
#
# 2026-10-06 09:20~12:30 KST 에 3시간 10분을 죽어 있었는데 아무도 몰랐다. 그날
# 트래픽 최고점이었고, 정훈이 우연히 접속해보기 전까지 몰랐다. 그래서 만든다.
#
# 설치: cp scripts/uptime-watch.sh ~/.local/bin/samae-uptime.sh
#       launchctl load ~/Library/LaunchAgents/com.jazz.samae-uptime.plist
#       (launchd 는 ~/.local/bin 사본을 돈다 — Documents 는 TCC 로 막혀서)

set -u

URL="${SAMAE_URL:-https://www.samae.ai/}"          # 테스트 때만 덮어쓴다
STATE="${SAMAE_STATE:-$HOME/Library/Logs/samae/uptime.state}"   # 연속 실패 횟수
FAIL_AT=2                                        # 두 번 연속 실패해야 알린다 (한 번은 깜빡임)
# ⚠️ 웹훅은 ~/Documents 밖에 둔다. launchd 로 돈 프로세스는 TCC 때문에 Documents 를
#    못 읽어서, .env.local 을 보게 하면 알림이 조용히 안 나간다 (실측 2026-10-06).
HOOK_FILE="${SAMAE_HOOK:-$HOME/Library/Application Support/samae/ops-webhook}"

log() { echo "$(date '+%F %T') $*"; }

webhook() {
  [ -f "$HOOK_FILE" ] || return 1
  tr -d '\r\n' < "$HOOK_FILE"
}

notify() {
  local hook body
  hook=$(webhook) || { log "웹훅 없음 — 알림 못 보냄"; return 0; }
  [ -n "$hook" ] || { log "웹훅 비어있음 — 알림 못 보냄"; return 0; }
  # 본문은 python 에 argv 로 넘긴다 — 셸 따옴표 중첩에서 깨지지 않게
  body=$(python3 -c 'import json,sys; print(json.dumps({"content": sys.argv[1]}))' "$1")
  curl -s -m 10 -o /dev/null -X POST "$hook" -H 'Content-Type: application/json' --data "$body"
}

# 우리 인터넷이 끊긴 건지 사이트가 죽은 건지 구분한다. 구분 못 하면 거짓 경보만 쌓인다.
online() { curl -s -m 8 -o /dev/null -w '%{http_code}' https://vercel.com/ | grep -qE '^[23]'; }

# 울리지 않는 경보는 없는 것과 같다. `--test` 로 전송 경로만 확인한다.
if [ "${1:-}" = "--test" ]; then
  notify "🧪 사매 감시 설치 확인 — 이 메시지가 보이면 경보 경로가 살아 있습니다. (맥미니 · 5분 주기)"
  log "테스트 전송"
  exit 0
fi

code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -A 'samae-uptime/1 (mac-mini)' "$URL")
prev=$(cat "$STATE" 2>/dev/null || echo 0)
case "$prev" in ''|*[!0-9]*) prev=0 ;; esac

if [ "$code" = "200" ]; then
  if [ "$prev" -ge "$FAIL_AT" ]; then
    notify "🟢 **사매 복구** — $URL 가 다시 200을 돌려줍니다. (약 $((prev * 5))분간 응답 없었음)"
    log "복구 (직전 연속실패 $prev)"
  fi
  echo 0 > "$STATE"
  exit 0
fi

if ! online; then
  log "사이트 $code 인데 맥미니 인터넷도 끊김 — 판단 보류 (상태 유지)"
  exit 0
fi

now=$((prev + 1))
echo "$now" > "$STATE"
log "실패 code=$code 연속=$now"

# 알림은 전이 시점에만. 긴 장애에 디스코드를 도배하지 않는다.
if [ "$now" -eq "$FAIL_AT" ]; then
  notify "🔴 **사매 응답 없음** — $URL 가 \`$code\` 를 돌려줍니다 ($((FAIL_AT * 5))분 연속). Vercel 배포·Supabase 상태를 확인하세요."
fi
