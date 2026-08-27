//go:build !dev

// Wails 桌面端入口（生产构建）。
//
// 启动流程：
//  1. 解析桌面运行环境（配置文件与工作目录，优先可执行文件目录/当前目录，回退到用户配置目录）；
//  2. 用与 Web 版完全相同的后端（internal/app）在 127.0.0.1 随机端口启动 HTTP 服务；
//  3. 打开 Wails 窗口，窗口先加载 redirector 页，由 Go 绑定返回服务地址后跳转到
//     http://127.0.0.1:<port>/，从而让 Cookie/会话/导出都跑在真实 HTTP 源上。
package main

import (
	"log"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

	"go-web/internal/app"
)

func main() {
	// 解析桌面运行环境：工作目录 + 配置路径
	workDir, configPath, err := resolveDesktopEnv()
	if err != nil {
		log.Fatalf("初始化桌面环境失败: %v", err)
	}
	if err := os.Chdir(workDir); err != nil {
		log.Fatalf("切换工作目录失败: %v", err)
	}

	// 初始化后端（配置加载、数据库、动态建表、路由）
	backend, err := app.New(configPath, app.WithDesktopMode())
	if err != nil {
		log.Fatalf("后端初始化失败: %v", err)
	}

	// 生产模式绑定随机端口，避免与用户其他服务冲突
	actualAddr, err := backend.Start(app.Options{Addr: desktopListenAddr()})
	if err != nil {
		log.Fatalf("后端启动失败: %v", err)
	}

	serverURL := "http://" + actualAddr
	log.Printf("桌面端后端已启动：%s（工作目录：%s，配置：%s）", serverURL, workDir, configPath)

	// 同时启动对外 Web 服务（默认按 config.yaml 的 server.host:port，仅本机；
	// 设置 GO_FORM_WEB_ADDR（如 "0.0.0.0:8080"）可覆盖并开放局域网访问）。
	if webAddr := backend.DesiredWebListenAddr(); webAddr != "" {
		if extraAddr, extraErr := backend.StartExtra(app.Options{Addr: webAddr}); extraErr != nil {
			log.Printf("Web 服务未启动（%s）：%v", webAddr, extraErr)
		} else {
			if lan := app.LANURL(extraAddr); lan != "" {
				log.Printf("Web 服务已同时启动：http://%s（局域网电脑可访问）", lan)
			} else {
				log.Printf("Web 服务已同时启动：http://%s（仅本机可访问）", extraAddr)
			}
		}
	}

	desktop := NewApp(backend, serverURL, workDir)

	err = wails.Run(&options.App{
		Title:     "Go 表单系统",
		Width:     1440,
		Height:    900,
		MinWidth:  1024,
		MinHeight: 700,
		AssetServer: &assetserver.Options{
			// 仅用于生产模式的首屏跳转页；真正的 Vue 前端由后端 HTTP 服务提供
			Assets: redirectorAssets,
		},
		OnStartup:  desktop.startup,
		OnShutdown: desktop.shutdown,
		Bind: []interface{}{
			desktop,
		},
		Menu: desktop.buildMenu(),
		BackgroundColour: &options.RGBA{
			R: 248,
			G: 250,
			B: 252,
			A: 1,
		},
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId: "com.go-form-web.desktop",
		},
	})
	if err != nil {
		log.Fatalf("桌面应用运行失败: %v", err)
	}
}

// desktopListenAddr 生产模式监听随机端口。
func desktopListenAddr() string {
	return "127.0.0.1:0"
}
