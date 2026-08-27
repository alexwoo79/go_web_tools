package main

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"
)

// redirectorAssets 生产模式首屏跳转页（Wails AssetServer 用）。
//
//go:embed all:redirector
var redirectorAssets embed.FS

// embeddedYAML 仓库根目录的 YAML 配置（首次运行写入用户配置目录）。
//
//go:embed *.yaml
var embeddedYAML embed.FS

// resolveDesktopEnv 返回桌面端工作目录与配置文件路径。
//
// 优先级：
//  1. 环境变量 GO_FORM_WEB_CONFIG 指定的配置文件；
//  2. 可执行文件所在目录下的 config.yaml（打包后 .app 内通常没有，自动跳过）；
//  3. 当前工作目录下的 config.yaml（开发模式从仓库根目录启动时命中）；
//  4. 用户配置目录（如 ~/Library/Application Support/go-form-web），首次运行自动写入默认配置。
func resolveDesktopEnv() (workDir, configPath string, err error) {
	if p := os.Getenv("GO_FORM_WEB_CONFIG"); p != "" {
		abs, absErr := filepath.Abs(p)
		if absErr != nil {
			return "", "", fmt.Errorf("解析 GO_FORM_WEB_CONFIG 失败: %w", absErr)
		}
		return filepath.Dir(abs), abs, nil
	}

	if exe, exeErr := os.Executable(); exeErr == nil {
		dir := filepath.Dir(exe)
		if p := filepath.Join(dir, "config.yaml"); fileExists(p) {
			return dir, p, nil
		}
	}

	if cwd, cwdErr := os.Getwd(); cwdErr == nil {
		if p := filepath.Join(cwd, "config.yaml"); fileExists(p) {
			return cwd, p, nil
		}
	}

	cfgDir, cfgErr := os.UserConfigDir()
	if cfgErr != nil {
		cfgDir = "."
	}
	dir := filepath.Join(cfgDir, "go-form-web")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", "", fmt.Errorf("创建用户配置目录失败: %w", err)
	}
	if err := writeDefaultYamlFiles(dir); err != nil {
		return "", "", err
	}
	return dir, filepath.Join(dir, "config.yaml"), nil
}

// writeDefaultYamlFiles 将内嵌的默认 YAML 配置写入目录（已存在的文件跳过，不覆盖用户数据）。
func writeDefaultYamlFiles(dir string) error {
	entries, err := embeddedYAML.ReadDir(".")
	if err != nil {
		return fmt.Errorf("读取内嵌配置失败: %w", err)
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		target := filepath.Join(dir, e.Name())
		if fileExists(target) {
			continue
		}
		data, readErr := embeddedYAML.ReadFile(e.Name())
		if readErr != nil {
			return fmt.Errorf("读取内嵌配置 %s 失败: %w", e.Name(), readErr)
		}
		if writeErr := os.WriteFile(target, data, 0o644); writeErr != nil {
			return fmt.Errorf("写入配置 %s 失败: %w", target, writeErr)
		}
	}
	return nil
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
