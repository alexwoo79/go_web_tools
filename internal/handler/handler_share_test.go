package handler

import (
	"net/http/httptest"
	"strings"
	"testing"
)

// TestBuildShareLinkURLProvider 验证分享链接优先使用注入的基础地址，空值回退请求 Host。
func TestBuildShareLinkURLProvider(t *testing.T) {
	req := httptest.NewRequest("GET", "http://example.com:8080/api/admin/share-links", nil)
	req.Host = "example.com:8080"

	// 未设置 provider：按请求 Host 推断
	h := &Handler{}
	if got := h.buildShareLinkURL(req, "tok123"); got != "http://example.com:8080/s/tok123" {
		t.Fatalf("未设置 provider 时 URL = %q", got)
	}

	// provider 返回空串：同样回退请求 Host
	h.SetShareURLBase(func() string { return "" })
	if got := h.buildShareLinkURL(req, "tok123"); got != "http://example.com:8080/s/tok123" {
		t.Fatalf("provider 空值时 URL = %q", got)
	}

	// provider 返回局域网地址：优先使用
	h.SetShareURLBase(func() string { return "http://192.168.1.5:9090" })
	if got := h.buildShareLinkURL(req, "tok123"); got != "http://192.168.1.5:9090/s/tok123" {
		t.Fatalf("provider 生效时 URL = %q", got)
	}

	// 尾部斜杠会被清理
	h.SetShareURLBase(func() string { return "http://192.168.1.5:9090/" })
	if got := h.buildShareLinkURL(req, "tok123"); !strings.HasSuffix(got, "/s/tok123") {
		t.Fatalf("尾部斜杠处理异常: %q", got)
	}
}
