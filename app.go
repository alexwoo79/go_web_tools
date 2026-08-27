package main

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"runtime"

	"github.com/wailsapp/wails/v2/pkg/menu"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"go-web/internal/app"
)

// App 是 Wails 绑定到前端的主应用。
//
// 生产模式下前端页面跑在 http://127.0.0.1:<port>/（真实 HTTP 源），
// 因此 Vue 前端不会调用 window.go 绑定；绑定仅用于 redirector 首屏跳转页
// 获取后端地址，以及系统菜单的原生操作。
type App struct {
	ctx       context.Context
	backend   *app.Server
	serverURL string
	workDir   string
}

// NewApp 创建桌面应用实例。workDir 为后端工作目录（数据/配置所在目录）。
func NewApp(backend *app.Server, serverURL, workDir string) *App {
	return &App{
		backend:   backend,
		serverURL: serverURL,
		workDir:   workDir,
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	log.Printf("Wails 桌面窗口已启动")
}

func (a *App) shutdown(ctx context.Context) {
	log.Printf("桌面应用退出，正在关闭后端服务...")
	if a.backend != nil {
		if err := a.backend.Shutdown(ctx); err != nil {
			log.Printf("后端关闭时发生错误：%v", err)
		}
	}
}

// GetServerURL 返回后端 HTTP 服务地址（redirector 首屏跳转页调用）。
func (a *App) GetServerURL() string {
	return a.serverURL
}

// buildMenu 构建原生系统菜单。
func (a *App) buildMenu() *menu.Menu {
	m := menu.NewMenu()

	if runtime.GOOS == "darwin" {
		m.Append(menu.AppMenu())
	}

	file := m.AddSubmenu("文件")
	file.AddText("在浏览器中打开", nil, func(_ *menu.CallbackData) {
		if a.ctx != nil && a.serverURL != "" {
			wruntime.BrowserOpenURL(a.ctx, a.serverURL)
		}
	})
	file.AddText("打开数据目录", nil, func(_ *menu.CallbackData) {
		a.openPath("data")
	})
	file.AddText("打开配置目录", nil, func(_ *menu.CallbackData) {
		a.openPath(".")
	})
	file.AddSeparator()
	file.AddText("退出", nil, func(_ *menu.CallbackData) {
		if a.ctx != nil {
			wruntime.Quit(a.ctx)
		}
	})

	return m
}

// openPath 用系统文件管理器打开指定目录（相对工作目录）。
func (a *App) openPath(rel string) {
	dir := rel
	if a.workDir != "" {
		dir = a.workDir + "/" + rel
	}
	if err := revealInFileManager(dir); err != nil {
		log.Printf("打开目录 %s 失败：%v", dir, err)
	}
}

func revealInFileManager(path string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", path)
	case "windows":
		cmd = exec.Command("explorer", path)
	case "linux":
		cmd = exec.Command("xdg-open", path)
	default:
		return fmt.Errorf("不支持的操作系统: %s", runtime.GOOS)
	}
	return cmd.Start()
}
