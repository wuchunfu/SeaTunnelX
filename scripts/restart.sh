#!/usr/bin/env bash
# SeaTunnelX 重启脚本：
# - 后端使用 PM2 启动（seatunnelx-api）
# - 前端默认使用 Next.js standalone 产物 + PM2 启动（seatunnelx-ui）
# - 可选通过 --frontend-dev 改为 pnpm run dev + PM2 启动，便于前端开发时避免重复构建
# - 启动前会检测并清理同名 PM2 进程，最后执行 pm2 save
#
# 用法：
#   ./scripts/restart.sh                  # 默认：构建前后端并重启
#   ./scripts/restart.sh --no-build       # 不构建，直接重启（需已有可用产物）
#   ./scripts/restart.sh --frontend-dev   # 前端改用 pnpm run dev 启动（跳过前端 build）
#   ./scripts/restart.sh --no-frontend    # 仅重启后端
#   ./scripts/restart.sh --stop-frontend  # 仅停止前端 PM2 进程

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

NO_BUILD=false
NO_FRONTEND=false
STOP_FRONTEND=false
FRONTEND_DEV=false
for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=true ;;
    --frontend-dev) FRONTEND_DEV=true ;;
    --no-frontend) NO_FRONTEND=true ;;
    --stop-frontend) STOP_FRONTEND=true ;;
  esac
done

PM2_API="${PM2_API:-seatunnelx-api}"
PM2_UI="${PM2_UI:-seatunnelx-ui}"
CONFIG_PATH="${CONFIG_PATH:-$PROJECT_ROOT/config.yaml}"
APP_EXTERNAL_URL="${APP_EXTERNAL_URL:-http://127.0.0.1:8000}"
FRONTEND_PORT="${FRONTEND_PORT:-80}"
NEXT_PUBLIC_BACKEND_BASE_URL="${NEXT_PUBLIC_BACKEND_BASE_URL:-http://127.0.0.1:8000}"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
FRONTEND_STANDALONE_DIR="$FRONTEND_DIR/dist-standalone"
FRONTEND_ENTRY="$FRONTEND_STANDALONE_DIR/server.js"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "缺少命令: $cmd"
    exit 1
  fi
}

pm2_name_count() {
  local name="$1"
  pm2 jlist 2>/dev/null | python3 -c '
import json,sys
name = sys.argv[1]
try:
    data = json.load(sys.stdin)
except Exception:
    print(0)
    raise SystemExit(0)
print(sum(1 for p in data if p.get("name") == name))
' "$name"
}

pm2_delete_if_exists() {
  local name="$1"
  local count
  count="$(pm2_name_count "$name" 2>/dev/null || echo 0)"
  count="$(echo "$count" | tr -dc '0-9')"
  count="${count:-0}"
  if [[ "$count" -gt 0 ]]; then
    echo "      检测到 PM2 中已有 $name (${count} 个)，先清理..."
    pm2 delete "$name" >/dev/null 2>&1 || true
  fi
}

ensure_config_external_url() {
  local config_path="$1"
  local external_url="$2"

  if [[ ! -f "$config_path" ]]; then
    echo "未找到配置文件 $config_path，跳过 external_url 同步."
    return 0
  fi

  python3 - "$config_path" "$external_url" <<'PY'
from pathlib import Path
import sys

config_path = Path(sys.argv[1])
external_url = sys.argv[2]
lines = config_path.read_text(encoding="utf-8").splitlines()

app_start = None
app_indent = ""
for index, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith("app:"):
        app_start = index
        app_indent = line[: len(line) - len(line.lstrip())]
        break

if app_start is None:
    raise SystemExit(0)

insert_at = app_start + 1
found = False
for index in range(app_start + 1, len(lines)):
    line = lines[index]
    stripped = line.strip()
    indent = line[: len(line) - len(line.lstrip())]
    if stripped and not stripped.startswith("#") and len(indent) <= len(app_indent):
      break
    if stripped.startswith("external_url:"):
      lines[index] = f'{app_indent}  external_url: "{external_url}"'
      found = True
      break
    insert_at = index + 1

if not found:
    lines.insert(insert_at, f'{app_indent}  external_url: "{external_url}"')

content = "\n".join(lines) + "\n"
config_path.write_text(content, encoding="utf-8")
PY

  echo "      已同步 app.external_url = $external_url"
}

prepare_frontend_standalone() {
  if [[ ! -f "$FRONTEND_DIR/package.json" ]]; then
    echo "未找到 frontend/package.json，跳过前端"
    return 1
  fi

  cd "$FRONTEND_DIR"

  if ! $NO_BUILD; then
    echo "      构建前端（next build）..."
    pnpm run build
  fi

  if [[ ! -f "$FRONTEND_DIR/.next/standalone/server.js" ]]; then
    echo "未找到 .next/standalone/server.js，请确认 next.config.ts 已配置 output: 'standalone'"
    return 1
  fi

  echo "      组装 standalone 运行目录..."
  rm -rf "$FRONTEND_STANDALONE_DIR"
  mkdir -p "$FRONTEND_STANDALONE_DIR/.next"
  cp -a "$FRONTEND_DIR/.next/standalone/." "$FRONTEND_STANDALONE_DIR/"
  if [[ -d "$FRONTEND_DIR/.next/static" ]]; then
    cp -a "$FRONTEND_DIR/.next/static" "$FRONTEND_STANDALONE_DIR/.next/static"
  fi
  if [[ -d "$FRONTEND_DIR/public" ]]; then
    cp -a "$FRONTEND_DIR/public" "$FRONTEND_STANDALONE_DIR/public"
  fi
  cd "$PROJECT_ROOT"

  if [[ ! -f "$FRONTEND_ENTRY" ]]; then
    echo "standalone 产物不完整: $FRONTEND_ENTRY 不存在"
    return 1
  fi
  return 0
}

start_frontend_dev() {
  if [[ ! -f "$FRONTEND_DIR/package.json" ]]; then
    echo "未找到 frontend/package.json，跳过前端"
    return 1
  fi

  pm2_delete_if_exists "$PM2_UI"
  HOSTNAME="0.0.0.0" PORT="$FRONTEND_PORT" NEXT_PUBLIC_BACKEND_BASE_URL="$NEXT_PUBLIC_BACKEND_BASE_URL" \
    pm2 start pnpm --name "$PM2_UI" --cwd "$FRONTEND_DIR" --update-env -- exec next dev --turbopack --hostname 0.0.0.0 --port "$FRONTEND_PORT"
  echo "      前端开发模式已启动 (http://127.0.0.1:$FRONTEND_PORT, command: pnpm run dev)."
  return 0
}

require_cmd go
require_cmd pm2
require_cmd pnpm
require_cmd python3

if [[ ! -f go.mod ]]; then
  echo "未在项目根找到 go.mod，请于项目根目录执行: ./scripts/restart.sh"
  exit 1
fi

ensure_config_external_url "$CONFIG_PATH" "$APP_EXTERNAL_URL"

if $STOP_FRONTEND; then
  echo "停止前端 (PM2: $PM2_UI)..."
  pm2_delete_if_exists "$PM2_UI"
  pm2 save >/dev/null 2>&1 || true
  pm2 status
  echo "完成."
  exit 0
fi

total=1
if ! $NO_BUILD; then total=$((total + 2)); fi
if ! $NO_FRONTEND; then total=$((total + 1)); fi
step=0

if ! $NO_BUILD; then
  step=$((step + 1)); echo "[$step/$total] 构建 seatunnelx ..."
  go build -o seatunnelx .
  echo "      seatunnelx 构建完成."

  step=$((step + 1)); echo "[$step/$total] 构建 seatunnelx-agent ..."
  (cd agent && go build -o seatunnelx-agent ./cmd)
  echo "      seatunnelx-agent 构建完成."

  if [[ -d lib/agent ]] && [[ -f agent/seatunnelx-agent ]]; then
    cp -f agent/seatunnelx-agent lib/agent/seatunnelx-agent-linux-amd64
    echo "      已同步 agent 到 lib/agent."
  fi
fi

step=$((step + 1)); echo "[$step/$total] 启动后端 (PM2: $PM2_API) ..."
if [[ ! -f "$PROJECT_ROOT/seatunnelx" ]]; then
  echo "未找到 $PROJECT_ROOT/seatunnelx，请先执行一次不带 --no-build 的重启"
  exit 1
fi
pm2_delete_if_exists "$PM2_API"
# 兜底：清理非 PM2 拉起的旧后端进程
pkill -f "$PROJECT_ROOT/seatunnelx api" >/dev/null 2>&1 || true
CONFIG_PATH="$CONFIG_PATH" pm2 start "$PROJECT_ROOT/seatunnelx" --name "$PM2_API" --cwd "$PROJECT_ROOT" --interpreter none -- api
echo "      后端已启动 (API: http://127.0.0.1:8000)."

if $NO_FRONTEND; then
  echo "      跳过前端 (--no-frontend)."
else
  step=$((step + 1))
  if $FRONTEND_DEV; then
    echo "[$step/$total] 启动前端开发模式 (PM2: $PM2_UI) ..."
    if start_frontend_dev; then
      :
    else
      echo "      前端启动已跳过."
    fi
  else
    echo "[$step/$total] 启动前端 standalone (PM2: $PM2_UI) ..."
    if prepare_frontend_standalone; then
      pm2_delete_if_exists "$PM2_UI"
      HOSTNAME="0.0.0.0" PORT="$FRONTEND_PORT" NEXT_PUBLIC_BACKEND_BASE_URL="$NEXT_PUBLIC_BACKEND_BASE_URL" \
        pm2 start "$FRONTEND_ENTRY" --name "$PM2_UI" --cwd "$FRONTEND_STANDALONE_DIR" --update-env
      echo "      前端已启动 (http://127.0.0.1:$FRONTEND_PORT)."
    else
      echo "      前端启动已跳过."
    fi
  fi
fi

echo "[*] 保存 PM2 进程列表 (pm2 save) ..."
pm2 save
pm2 status
echo "完成."
