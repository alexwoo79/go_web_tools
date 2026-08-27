package app

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestServerMultiListener 验证同一后端可同时监听多个地址（桌面窗口回环端口 + 对外 Web 端口）。
func TestServerMultiListener(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	cfg := "server:\n  port: 8080\n  host: \"localhost\"\ndatabase:\n  path: \"data/data.db\"\n  type: \"sqlite\"\nforms: []\n"
	if err := os.WriteFile(cfgPath, []byte(cfg), 0o644); err != nil {
		t.Fatalf("写入临时配置失败: %v", err)
	}

	oldWD, _ := os.Getwd()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("切换临时目录失败: %v", err)
	}
	defer func() { _ = os.Chdir(oldWD) }()

	srv, err := New(cfgPath, WithDesktopMode())
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	addr1, err := srv.Start(Options{Addr: "127.0.0.1:0"})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	addr2, err := srv.StartExtra(Options{Addr: "127.0.0.1:0"})
	if err != nil {
		t.Fatalf("StartExtra: %v", err)
	}
	if addr1 == addr2 {
		t.Fatalf("两个监听地址不应相同: %s == %s", addr1, addr2)
	}

	for _, addr := range []string{addr1, addr2} {
		resp, err := http.Get("http://" + addr + "/healthz")
		if err != nil {
			t.Fatalf("请求 %s 失败: %v", addr, err)
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK || string(body) != "ok" {
			t.Fatalf("healthz 异常: addr=%s status=%d body=%q", addr, resp.StatusCode, body)
		}
	}

	if got := srv.WebListenAddr(); got != "localhost:8080" {
		t.Errorf("WebListenAddr = %q, 期望 localhost:8080", got)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
}

// TestWebListenAddrLAN 验证 host 改为 0.0.0.0 时返回可开放局域网的地址。
func TestWebListenAddrLAN(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	cfg := "server:\n  port: 8080\n  host: \"0.0.0.0\"\ndatabase:\n  path: \"data/data.db\"\n  type: \"sqlite\"\nforms: []\n"
	if err := os.WriteFile(cfgPath, []byte(cfg), 0o644); err != nil {
		t.Fatalf("写入临时配置失败: %v", err)
	}

	oldWD, _ := os.Getwd()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("切换临时目录失败: %v", err)
	}
	defer func() { _ = os.Chdir(oldWD) }()

	srv, err := New(cfgPath)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer func() { _ = srv.Shutdown(context.Background()) }()

	if got := srv.WebListenAddr(); got != "0.0.0.0:8080" || !strings.HasPrefix(got, "0.0.0.0") {
		t.Errorf("WebListenAddr = %q, 期望 0.0.0.0:8080", got)
	}
}

// TestDesiredWebListenAddrDefaultLAN 验证桌面端 Web 服务默认开启局域网：
// 配置为回环主机时自动改用 0.0.0.0，环境变量可覆盖，显式非回环地址保持不变。
func TestDesiredWebListenAddrDefaultLAN(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	writeCfg := func(host string) {
		cfg := fmt.Sprintf("server:\n  port: 8080\n  host: %q\ndatabase:\n  path: \"data/data.db\"\n  type: \"sqlite\"\nforms: []\n", host)
		if err := os.WriteFile(cfgPath, []byte(cfg), 0o644); err != nil {
			t.Fatalf("写入临时配置失败: %v", err)
		}
	}

	oldWD, _ := os.Getwd()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("切换临时目录失败: %v", err)
	}
	defer func() { _ = os.Chdir(oldWD) }()

	// 配置 host=localhost：默认转为 0.0.0.0（局域网）
	writeCfg("localhost")
	t.Setenv("GO_FORM_WEB_ADDR", "")
	srv, err := New(cfgPath)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer func() { _ = srv.Shutdown(context.Background()) }()
	if got := srv.DesiredWebListenAddr(); got != "0.0.0.0:8080" {
		t.Fatalf("DesiredWebListenAddr(localhost) = %q, 期望 0.0.0.0:8080", got)
	}

	// 环境变量覆盖：强制仅本机
	t.Setenv("GO_FORM_WEB_ADDR", "127.0.0.1:8081")
	if got := srv.DesiredWebListenAddr(); got != "127.0.0.1:8081" {
		t.Fatalf("DesiredWebListenAddr(env) = %q, 期望 127.0.0.1:8081", got)
	}

	// 显式非回环地址保持不变
	writeCfg("192.168.1.50")
	t.Setenv("GO_FORM_WEB_ADDR", "")
	srv2, err := New(cfgPath)
	if err != nil {
		t.Fatalf("New(显式地址): %v", err)
	}
	defer func() { _ = srv2.Shutdown(context.Background()) }()
	if got := srv2.DesiredWebListenAddr(); got != "192.168.1.50:8080" {
		t.Fatalf("DesiredWebListenAddr(显式) = %q, 期望 192.168.1.50:8080", got)
	}
}

// TestWebServiceToggle 验证对外 Web 服务的运行时启停、状态查询与 HTTP 接口鉴权。
func TestWebServiceToggle(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	cfg := "server:\n  port: 8080\n  host: \"localhost\"\ndatabase:\n  path: \"data/data.db\"\n  type: \"sqlite\"\nforms: []\n"
	if err := os.WriteFile(cfgPath, []byte(cfg), 0o644); err != nil {
		t.Fatalf("写入临时配置失败: %v", err)
	}

	oldWD, _ := os.Getwd()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("切换临时目录失败: %v", err)
	}
	defer func() { _ = os.Chdir(oldWD) }()

	// 用随机端口覆盖配置中的固定端口，避免测试冲突
	t.Setenv("GO_FORM_WEB_ADDR", "127.0.0.1:0")

	srv, err := New(cfgPath, WithDesktopMode())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	addr1, err := srv.Start(Options{Addr: "127.0.0.1:0"})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}

	// 初始状态：未运行
	st := srv.WebServiceStatus()
	if !st.Available || st.Running || st.Addr != "" {
		t.Fatalf("初始状态异常: %+v", st)
	}

	// 控制接口无需登录（登录页使用），应返回 200 且可查状态
	resp, err := http.Get("http://" + addr1 + "/api/desktop/web-service")
	if err != nil {
		t.Fatalf("请求控制接口失败: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("访问控制接口 status=%d, 期望 200", resp.StatusCode)
	}

	// 启动
	st, err = srv.StartWebService()
	if err != nil {
		t.Fatalf("StartWebService: %v", err)
	}
	if !st.Running || st.Addr == "" {
		t.Fatalf("启动后状态异常: %+v", st)
	}

	// 幂等：重复启动返回相同地址
	addr2, err := srv.StartExtra(Options{Addr: "127.0.0.1:0"})
	if err != nil {
		t.Fatalf("重复 StartExtra: %v", err)
	}
	if addr2 != st.Addr {
		t.Fatalf("重复启动地址不一致: %s != %s", addr2, st.Addr)
	}

	// 局域网（额外）监听应屏蔽桌面端控制接口，避免局域网用户关闭服务
	if resp, err := http.Get("http://" + st.Addr + "/api/desktop/web-service"); err != nil {
		t.Fatalf("访问额外监听控制接口失败: %v", err)
	} else {
		resp.Body.Close()
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("额外监听控制接口 status=%d, 期望 403", resp.StatusCode)
		}
	}

	// 本机（主）监听仍可正常访问控制接口
	if resp, err := http.Get("http://" + addr1 + "/api/desktop/web-service"); err != nil {
		t.Fatalf("访问主监听控制接口失败: %v", err)
	} else {
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("主监听控制接口 status=%d, 期望 200", resp.StatusCode)
		}
	}

	// 停止
	st, err = srv.StopWebService()
	if err != nil {
		t.Fatalf("StopWebService: %v", err)
	}
	if st.Running || st.Addr != "" {
		t.Fatalf("停止后状态异常: %+v", st)
	}

	// 停止后原端口应已关闭
	if resp, err := http.Get("http://" + addr2 + "/healthz"); err == nil {
		resp.Body.Close()
		t.Fatalf("停止后端口 %s 仍可访问", addr2)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
}

// TestWebServiceToggleHTTP 走完整 HTTP 流程（无需登录）：查状态 → 启动 → 幂等 → 停止。
func TestWebServiceToggleHTTP(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	cfg := "server:\n  port: 8080\n  host: \"localhost\"\ndatabase:\n  path: \"data/data.db\"\n  type: \"sqlite\"\nforms: []\n"
	if err := os.WriteFile(cfgPath, []byte(cfg), 0o644); err != nil {
		t.Fatalf("写入临时配置失败: %v", err)
	}

	oldWD, _ := os.Getwd()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("切换临时目录失败: %v", err)
	}
	defer func() { _ = os.Chdir(oldWD) }()

	t.Setenv("GO_FORM_WEB_ADDR", "127.0.0.1:0")

	srv, err := New(cfgPath, WithDesktopMode())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	base, err := srv.Start(Options{Addr: "127.0.0.1:0"})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}

	client := &http.Client{Timeout: 5 * time.Second}

	do := func(method, path string) (int, map[string]interface{}) {
		req, _ := http.NewRequest(method, "http://"+base+path, nil)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("%s %s 失败: %v", method, path, err)
		}
		defer resp.Body.Close()
		var data map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&data)
		return resp.StatusCode, data
	}

	// 初始状态
	code, data := do(http.MethodGet, "/api/desktop/web-service")
	if code != http.StatusOK || data["running"] != false {
		t.Fatalf("初始状态异常: code=%d data=%v", code, data)
	}

	// 启动
	code, data = do(http.MethodPost, "/api/desktop/web-service")
	if code != http.StatusOK || data["running"] != true {
		t.Fatalf("启动失败: code=%d data=%v", code, data)
	}
	firstAddr, _ := data["addr"].(string)
	if firstAddr == "" {
		t.Fatalf("启动后 addr 为空: %v", data)
	}

	// 幂等：再次启动地址不变
	code, data = do(http.MethodPost, "/api/desktop/web-service")
	if code != http.StatusOK || data["addr"] != firstAddr {
		t.Fatalf("重复启动异常: code=%d data=%v", code, data)
	}

	// 停止
	code, data = do(http.MethodDelete, "/api/desktop/web-service")
	if code != http.StatusOK || data["running"] != false {
		t.Fatalf("停止失败: code=%d data=%v", code, data)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
}

// TestStartExtraPortFallback 验证目标端口被占用时，Web 服务自动改用空闲端口。
func TestStartExtraPortFallback(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	cfg := "server:\n  port: 8080\n  host: \"localhost\"\ndatabase:\n  path: \"data/data.db\"\n  type: \"sqlite\"\nforms: []\n"
	if err := os.WriteFile(cfgPath, []byte(cfg), 0o644); err != nil {
		t.Fatalf("写入临时配置失败: %v", err)
	}

	oldWD, _ := os.Getwd()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("切换临时目录失败: %v", err)
	}
	defer func() { _ = os.Chdir(oldWD) }()

	srv, err := New(cfgPath)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := srv.Start(Options{Addr: "127.0.0.1:0"}); err != nil {
		t.Fatalf("Start: %v", err)
	}

	// 先占住一个固定端口
	busy, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("占用端口失败: %v", err)
	}
	busyAddr := busy.Addr().String()
	defer func() { _ = busy.Close() }()

	// 启动到被占用的端口，应自动回退到空闲端口
	addr, err := srv.StartExtra(Options{Addr: busyAddr})
	if err != nil {
		t.Fatalf("StartExtra(被占用端口) 失败: %v", err)
	}
	if addr == busyAddr {
		t.Fatalf("应自动改用空闲端口，仍返回 %s", addr)
	}

	resp, err := http.Get("http://" + addr + "/healthz")
	if err != nil {
		t.Fatalf("回退端口 %s 不可访问: %v", addr, err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("回退端口 healthz status=%d", resp.StatusCode)
	}

	if st := srv.WebServiceStatus(); st.Addr != addr {
		t.Fatalf("状态地址 %q != 实际地址 %q", st.Addr, addr)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
}

// TestShareLinkURLExtraRunning 验证分享链接使用对外 Web 监听的实际地址：
// 额外监听运行时指向额外端口，未运行时指向主监听回环地址。
func TestShareLinkURLExtraRunning(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")
	cfg := `server:
  port: 8080
  host: "localhost"
database:
  path: "data/data.db"
  type: "sqlite"
forms:
  - name: "share_test"
    title: "分享测试"
    status: "published"
    fields:
      - name: "name"
        label: "姓名"
        type: "text"
`
	if err := os.WriteFile(cfgPath, []byte(cfg), 0o644); err != nil {
		t.Fatalf("写入临时配置失败: %v", err)
	}

	oldWD, _ := os.Getwd()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("切换临时目录失败: %v", err)
	}
	defer func() { _ = os.Chdir(oldWD) }()

	t.Setenv("GO_FORM_WEB_ADDR", "127.0.0.1:0")

	srv, err := New(cfgPath, WithDesktopMode())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	base, err := srv.Start(Options{Addr: "127.0.0.1:0"})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}

	client := &http.Client{Timeout: 5 * time.Second}
	loginResp, err := client.Post("http://"+base+"/api/login", "application/json",
		strings.NewReader(`{"username":"admin","password":"admin123"}`))
	if err != nil {
		t.Fatalf("登录失败: %v", err)
	}
	loginResp.Body.Close()
	cookie := ""
	if setCookie := loginResp.Header.Get("Set-Cookie"); setCookie != "" {
		cookie = strings.SplitN(setCookie, ";", 2)[0]
	}

	generate := func() string {
		req, _ := http.NewRequest(http.MethodPost, "http://"+base+"/api/admin/share-links",
			strings.NewReader(`{"formName":"share_test"}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Cookie", cookie)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("生成分享链接失败: %v", err)
		}
		defer resp.Body.Close()
		var data map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&data)
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("生成分享链接 status=%d data=%v", resp.StatusCode, data)
		}
		url, _ := data["url"].(string)
		return url
	}

	// 额外监听未启动：链接应指向主监听回环地址
	urlOff := generate()
	if !strings.HasPrefix(urlOff, "http://127.0.0.1:") || !strings.Contains(urlOff, "/s/") {
		t.Fatalf("额外监听未启动时 URL 异常: %q", urlOff)
	}
	if !strings.Contains(urlOff, base) {
		t.Fatalf("URL %q 应包含主监听端口 %q", urlOff, base)
	}

	// 启动额外监听：链接应指向额外监听实际地址
	extraAddr, err := srv.StartExtra(Options{Addr: "127.0.0.1:0"})
	if err != nil {
		t.Fatalf("StartExtra: %v", err)
	}
	urlOn := generate()
	if !strings.Contains(urlOn, extraAddr) {
		t.Fatalf("额外监听启动后 URL %q 应包含 %q", urlOn, extraAddr)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
}
