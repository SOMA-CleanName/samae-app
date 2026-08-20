#!/bin/bash
# 페르소나 상주 서비스(serve.py) 실행 래퍼 — launchd(com.samae.serve)가 부른다.
#
# 하는 일: .env.local 에서 PERSONA_SERVICE_TOKEN 을 읽어 serve.py 8077 을 exec.
# launchd 의 KeepAlive 가 재시작을 책임지므로 여기서 루프를 돌지 않는다.
# 로그는 launchd 의 StandardOut/ErrorPath(scripts/embed/logs/serve.log)로 간다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# .env.local 은 export 없는 KEY=VALUE 형식 — set -a 로 전부 환경으로 올린다
set -a
# shellcheck disable=SC1091
source "$ROOT/.env.local"
set +a

[ -n "${PERSONA_SERVICE_TOKEN:-}" ] || {
  echo "PERSONA_SERVICE_TOKEN 이 .env.local 에 없습니다 — Funnel 공개 서비스는 토큰 필수" >&2
  exit 1
}

exec "$ROOT/scripts/embed/.venv/bin/python" "$ROOT/scripts/embed/serve.py" 8077
