#!/usr/bin/env bash

# proxy_check.sh
# 检查当前终端代理环境变量是否已设置，并测试网络连通性。

set -euo pipefail

print_env() {
  local name="$1"
  local value="${!name:-}"
  if [[ -n "$value" ]]; then
    printf "%-12s= %s\n" "$name" "$value"
  else
    printf "%-12s= (unset)\n" "$name"
  fi
}

check_command() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "$1"
  else
    echo ""
  fi
}

main() {
  echo "检查代理环境变量..."
  echo

  print_env HTTP_PROXY
  print_env HTTPS_PROXY
  print_env NO_PROXY
  echo
  print_env http_proxy
  print_env https_proxy
  print_env no_proxy
  echo

  local proxy_set=false
  for name in HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy; do
    if [[ -n "${!name:-}" ]]; then
      proxy_set=true
      break
    fi
  done

  if [[ "$proxy_set" == false ]]; then
    echo "警告: 未检测到代理环境变量。"
    echo "如果你依赖代理访问网络，请先设置 HTTP_PROXY/HTTPS_PROXY/NO_PROXY。"
  else
    echo "已检测到代理设置。"
  fi

  echo
  echo "测试网络连通性..."
  local test_url="https://www.google.com/"
  local cmd

  cmd="$(check_command curl)"
  if [[ -n "$cmd" ]]; then
    echo "使用 curl 进行测试..."
    if curl --silent --head --fail --max-time 10 "$test_url" >/dev/null 2>&1; then
      echo "网络测试成功: 可以访问 $test_url" 
      return 0
    fi
  fi

  cmd="$(check_command wget)"
  if [[ -n "$cmd" ]]; then
    echo "使用 wget 进行测试..."
    if wget --quiet --spider --timeout=10 "$test_url" >/dev/null 2>&1; then
      echo "网络测试成功: 可以访问 $test_url"
      return 0
    fi
  fi

  echo "网络测试失败。"
  echo "请确认代理配置是否正确，或尝试使用其它测试 URL。"
  echo "如果你的环境不能直接访问 https://www.google.com/，可修改脚本中的 test_url 为可达地址。"
  return 1
}

main "$@"
