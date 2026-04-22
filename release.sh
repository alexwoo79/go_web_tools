#!/bin/bash

# ==================== 自动发布脚本 ====================
# 功能：输入版本号 → 推送代码 → 打Tag → 执行 build.sh 编译 → 发布 GitHub Release
# ======================================================

# 1. 提示输入版本号
echo "====================================="
echo "        Go Web 版本发布工具"
echo "====================================="
read -p "请输入发布版本号（例如 v1.2）：" VERSION

# 2. 确认
echo -e "\n你将要发布的版本：\033[32m$VERSION\033[0m"
read -p "确定继续？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "发布已取消"
    exit 1
fi

# 3. 切换到 main 分支
echo -e "\n\033[33m[1/6] 切换到 main 分支...\033[0m"
git switch main

# 4. 推送代码
echo -e "\033[33m[2/6] 推送 main 分支代码...\033[0m"
git push origin main

# 5. 打 tag
echo -e "\033[33m[3/6] 创建 tag：$VERSION\033[0m"
git tag -a "$VERSION" -m "发布 $VERSION"

# 6. 推送 tag
echo -e "\033[33m[4/6] 推送 tag 到远程...\033[0m"
git push origin "$VERSION"

# 7. 调用你的 build.sh 编译（重点在这里！）
echo -e "\033[33m[5/6] 执行 build.sh 编译程序...\033[0m"
chmod +x build.sh  # 确保可执行
./build.sh  all      # 运行你的编译脚本

# 8. 发布 GitHub Release
echo -e "\033[33m[6/6] 创建 GitHub Release 并上传 bin 文件...\033[0m"
if command -v gh >/dev/null 2>&1; then
  gh release create "$VERSION" \
    --title "$VERSION 正式版" \
    --notes "发布 $VERSION 版本" \
    ./bin/*
else
  echo "gh: command not found — 使用 GitHub API 通过 GITHUB_TOKEN 上传资产"
  if [ -z "$GITHUB_TOKEN" ]; then
    echo "错误：环境变量 GITHUB_TOKEN 未设置。请设置一个有 repo 权限的 token 或安装 gh CLI。"
    exit 1
  fi

  repo_url=$(git config --get remote.origin.url)
  if [[ $repo_url =~ ^git@github.com:(.*)\.git$ ]]; then
    repo=${BASH_REMATCH[1]}
  elif [[ $repo_url =~ ^https://github.com/(.*)\.git$ ]]; then
    repo=${BASH_REMATCH[1]}
  else
    echo "无法从 remote.origin.url 解析仓库：$repo_url"
    exit 1
  fi

  echo "创建 release $VERSION 于仓库 $repo"
  payload=$(printf '{"tag_name":"%s","name":"%s 正式版","body":"发布 %s 版本"}' "$VERSION" "$VERSION" "$VERSION")
  resp=$(curl -s -H "Authorization: token $GITHUB_TOKEN" -H "Content-Type: application/json" -d "$payload" "https://api.github.com/repos/$repo/releases")

  upload_url=$(echo "$resp" | python -c 'import sys, json
data=json.load(sys.stdin)
u=data.get("upload_url", "")
print(u.split("{")[0] if u else "")')

  if [ -z "$upload_url" ]; then
    echo "创建 release 失败: $resp"
    exit 1
  fi

  for f in ./bin/*; do
    [ -f "$f" ] || continue
    name=$(basename "$f")
    mime=$(file -b --mime-type "$f" 2>/dev/null || echo application/octet-stream)
    echo "上传 $name ..."
    curl -s --data-binary @"$f" -H "Authorization: token $GITHUB_TOKEN" -H "Content-Type: $mime" "$upload_url?name=$name" >/dev/null
  done
fi

# 完成
echo -e "\n\033[32m✅ 发布完成！版本：$VERSION\033[0m"
