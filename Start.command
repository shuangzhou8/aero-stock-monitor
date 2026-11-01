#!/bin/zsh
set -eu
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "请先安装 Node.js 22 或更新版本：https://nodejs.org/"
  read -r "?按回车退出"
  exit 1
fi
if [[ ! -d node_modules/ethers ]]; then
  npm ci --no-audit --no-fund
fi
node start.mjs
open 'http://127.0.0.1:4381'
