# Build Directory

The build directory is used to house all the build files and assets for the Wails
desktop app (`make wails-build` / `wails build`).

* `bin` - Wails 输出目录
* `darwin` - macOS 专用文件（Info.plist）
* `windows` - Windows 专用文件（manifest / icon）
* `appicon.png` - 应用图标（1024×1024，`wails build` 会自动生成 .icns / .ico）

删除 `darwin` / `windows` 下的文件后重新 `wails build`，Wails 会生成默认配置。
