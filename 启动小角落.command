#!/bin/bash
# 「小角落」一键启动器：双击我 = 启动前后端服务 + 自动打开浏览器
# 关闭方法：直接关掉弹出的两个黑色终端窗口即可

export PATH="/Users/pmx/.workbuddy/binaries/node/versions/22.22.2-2/bin:$PATH"
cd "$(dirname "$0")"

echo "启动中……（约 5 秒后浏览器会自动打开）"

# 启动后端（端口 8787）
(cd apps/server && npm run dev) &

# 启动前端（端口 5173）
(cd apps/web && npm run dev) &

# 等服务就绪后自动打开浏览器
sleep 5
open "http://localhost:5173"

echo ""
echo "✅ 两个服务已在后台运行。"
echo "   浏览器地址：http://localhost:5173"
echo "   不想用了就关掉这两个终端窗口。"
echo "   （可以最小化这个窗口，别关）"
sleep 100000
