#!/bin/bash
# 맥미니 임베딩 배치 환경 설치 — 몇 번 돌려도 안전하다. (docs/22 §7.4)
#
#   bash scripts/embed/macmini-setup.sh
#
# 하는 일: Python 3.12 확인 → venv → 패키지 → 모델 캐시 예열 → launchd 등록
# 하지 않는 일: sudo 가 필요한 작업(슬립 설정)은 명령만 안내한다.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_DIR="$ROOT/scripts/embed/.venv"
PY="/opt/homebrew/bin/python3.12"
AGENT="$HOME/Library/LaunchAgents/com.samae.embed.plist"
ok()   { printf '  ✅ %s\n' "$1"; }
warn() { printf '  ⚠️  %s\n' "$1"; }
die()  { printf '  ❌ %s\n' "$1"; exit 1; }

echo "저장소: $ROOT"
echo
echo "① Python 3.12"
if [ ! -x "$PY" ]; then
  command -v brew >/dev/null || die "Homebrew 가 없습니다. https://brew.sh 참고"
  echo "  설치 중… (몇 분 걸립니다)"
  brew install python@3.12 || die "python@3.12 설치 실패"
fi
ok "$("$PY" -V)"

echo
echo "② 가상환경"
[ -x "$VENV_DIR/bin/python" ] || "$PY" -m venv "$VENV_DIR" || die "venv 생성 실패"
ok "$VENV_DIR"

echo
echo "③ 패키지 (torch·transformers 등 · 처음엔 수 분)"
"$VENV_DIR/bin/pip" install -q --upgrade pip
"$VENV_DIR/bin/pip" install -q -r "$ROOT/scripts/embed/requirements.txt" || die "패키지 설치 실패"
ok "requirements.txt 반영"

echo
echo "④ 접속 정보"
if [ ! -f "$ROOT/.env.local" ]; then
  die ".env.local 이 없습니다. NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 를 넣어 만드세요."
fi
grep -q '^SUPABASE_SERVICE_ROLE_KEY=' "$ROOT/.env.local" || die ".env.local 에 SUPABASE_SERVICE_ROLE_KEY 가 없습니다."
# service_role 키는 RLS 를 우회한다. 이 기계에 평문으로 두므로 권한을 좁힌다.
chmod 600 "$ROOT/.env.local"
ok ".env.local 확인 (권한 600)"

echo
echo "⑤ 모델 캐시 예열 (약 4.4GB · 첫 실행만)"
"$VENV_DIR/bin/python" - <<'PY' || { echo "  ⚠️  예열 실패 — 첫 배치에서 받게 됩니다."; }
import sys; sys.path.insert(0, "scripts/embed")
import siglip
siglip.load()
print("  ✅ 모델 준비 완료")
PY

echo
echo "⑥ launchd 등록 (매일 06:00)"
mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/scripts/embed/logs"
sed "s|__REPO__|$ROOT|g" "$ROOT/scripts/embed/com.samae.embed.plist.template" > "$AGENT"
launchctl unload "$AGENT" 2>/dev/null
launchctl load "$AGENT" || die "launchctl load 실패"
ok "$AGENT"

echo
echo "───────────────────────────────────────────────"
echo "설치 완료. 남은 것은 두 가지입니다."
echo
echo "1) 잠들지 않게 설정 (관리자 권한 필요 — 직접 실행하세요)"
echo "     sudo pmset -a sleep 0 disksleep 0"
echo "     sudo pmset -a womp 1          # 네트워크로 깨우기"
echo
echo "2) 지금 한 번 돌려 확인"
echo "     bash scripts/embed/run-embed.sh"
echo "     tail -f scripts/embed/logs/embed-*.log"
echo
echo "예약 확인:  launchctl list | grep com.samae.embed"
echo "해제:       launchctl unload $AGENT"
