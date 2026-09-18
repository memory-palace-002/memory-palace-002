#!/bin/bash
# 「小角落」一键启动器 v2：双击我 = 启动前后端 + 自动体检 + 打开浏览器
# 关闭方法：直接关掉弹出的终端窗口即可

export PATH="/Users/pmx/.workbuddy/binaries/node/versions/22.22.2-2/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")"
LOG_DIR="$PWD/logs"
mkdir -p "$LOG_DIR"

echo "启动中……（约 8 秒后浏览器会自动打开）"

# 启动后端（端口 8787），日志写入 logs/server.log
(cd apps/server && env -u NODE_OPTIONS npm run dev > "$LOG_DIR/server.log" 2>&1) &

# 启动前端（端口 5173），日志写入 logs/web.log
(cd apps/web && env -u NODE_OPTIONS npm run dev > "$LOG_DIR/web.log" 2>&1) &

# ---- 自动体检：后端就绪才放行 ----
BACKEND_OK=0
for i in $(seq 1 20); do
  sleep 1
  if curl -s --noproxy '*' http://127.0.0.1:8787/api/health | grep -q '"code":0'; then
    BACKEND_OK=1
    break
  fi
done

if [ "$BACKEND_OK" = "1" ]; then
  echo "✅ 后端已就绪（http://localhost:8787）"
else
  echo ""
  echo "❌ 后端启动失败！最近日志如下（完整日志在 logs/server.log）："
  echo "----------------------------------------"
  tail -20 "$LOG_DIR/server.log"
  echo "----------------------------------------"
  echo "请把上面的报错截图发给甲处理。按回车键关闭本窗口……"
  read -r
  exit 1
fi

# 前端体检
FRONTEND_OK=0
for i in $(seq 1 15); do
  sleep 1
  if curl -s --noproxy '*' -o /dev/null -w "%{http_code}" http://127.0.0.1:5173 | grep -q "200"; then
    FRONTEND_OK=1
    break
  fi
done

if [ "$FRONTEND_OK" = "1" ]; then
  echo "✅ 前端已就绪（http://localhost:5173）"
else
  echo "⚠️ 前端似乎没起来，日志在 logs/web.log（不影响后端，可先看报错）"
  tail -10 "$LOG_DIR/web.log"
fi

open "http://localhost:5173"

echo ""
echo "✅ 两个服务已在后台运行。"
echo "   浏览器地址：http://localhost:5173"
echo "   日志文件：logs/server.log 和 logs/web.log"
echo "   不想用了就关掉这个终端窗口。"
echo "   （可以最小化这个窗口，别关）"
sleep 100000
