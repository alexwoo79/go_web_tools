//go:build dev

// Wails 桌面端入口（开发模式，由 `wails dev` 以 -tags dev 编译）。
//
// 开发模式下窗口加载 Vite Dev Server（vue-form，默认 5173），
// Vite 将 /api 代理到 http://localhost:8080，因此后端固定监听 8080，
// 与仓库原有的 `make air` / `make api` 开发体验保持一致。
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
	workDir, configPath, err := resolveDesktopEnv()
	if err != nil {
		log.Fatalf("初始化桌面环境失败: %v", err)
	}
	if err := os.Chdir(workDir); err != nil {
		log.Fatalf("切换工作目录失败: %v", err)
	}

	backend, err := app.New(configPath, app.WithDesktopMode())
	if err != nil {
		log.Fatalf("后端初始化失败: %v", err)
	}

	// 开发模式固定 8080，供 Vite 代理 /api
	actualAddr, err := backend.Start(app.Options{Addr: desktopListenAddr()})
	if err != nil {
		log.Fatalf("后端启动失败: %v", err)
	}

	log.Printf("桌面端后端已启动：http://%s（工作目录：%s）", actualAddr, workDir)

	desktop := NewApp(backend, "http://"+actualAddr, workDir)

	err = wails.Run(&options.App{
		Title:     "Go 表单系统 (dev)",
		Width:     1440,
		Height:    900,
		MinWidth:  1024,
		MinHeight: 700,
		AssetServer: &assetserver.Options{
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

// desktopListenAddr 开发模式固定 8080（与 vue-form/vite.config.ts 的 /api 代理一致）。
func desktopListenAddr() string {
	return "127.0.0.1:8080"
}
