// Package app 是 Go 表单系统后端的统一入口：负责配置加载、数据库初始化、
// 动态建表、路由组装与 HTTP 服务生命周期。
//
// 命令行 Web 服务（cmd/server）与 Wails 桌面端（仓库根目录 main.go）共用
// 同一套初始化逻辑，避免两套实现分叉。
package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"go-web/internal/config"
	"go-web/internal/handler"
	"go-web/internal/models"

	"github.com/gorilla/mux"
)

// Options 描述启动 HTTP 服务的参数。
type Options struct {
	// Addr 监听地址，如 "0.0.0.0:8080" 或 "127.0.0.1:0"（随机端口）。
	Addr string
	// TLSCert / TLSKey 同时非空时启用 HTTPS。
	TLSCert string
	TLSKey  string
}

// Server 封装后端：配置、数据库、路由与 HTTP 服务。
type Server struct {
	configPath string
	cfg        *config.Config
	db         *models.Database
	router     *mux.Router
	desktop    bool

	addr     string
	started  bool
	serveErr chan error
	mu       sync.Mutex
	servers  []*http.Server

	extraMu   sync.Mutex
	extraSrv  *http.Server
	extraAddr string

	reloadFn func() ([]handler.FormInfo, error)
}

// NewOption 配置 Server 的可选参数。
type NewOption func(*Server)

// WithDesktopMode 标记当前进程为 Wails 桌面端：注册对外 Web 服务启停接口。
func WithDesktopMode() NewOption {
	return func(s *Server) { s.desktop = true }
}

// New 加载配置、初始化数据库、创建/更新表单数据表并组装路由。
func New(configPath string, opts ...NewOption) (*Server, error) {
	cfg, err := config.Load(configPath)
	if err != nil {
		return nil, fmt.Errorf("加载配置失败: %w", err)
	}

	if err := ensureRuntimeDirs(cfg.Database.Path); err != nil {
		return nil, fmt.Errorf("创建运行目录失败: %w", err)
	}

	db, err := models.NewDatabase(cfg.Database.Path, cfg.Database.Type)
	if err != nil {
		return nil, fmt.Errorf("数据库初始化失败: %w", err)
	}

	s := &Server{
		configPath: configPath,
		cfg:        cfg,
		db:         db,
		serveErr:   make(chan error, 1),
	}
	for _, opt := range opts {
		opt(s)
	}

	// 转换表单配置，并动态创建或更新数据库表结构
	formInfos := s.buildFormInfos(cfg)
	for _, fi := range formInfos {
		tableName := fi.Model.TableName
		modelsFields := toModelsFields(fi.Fields)

		if db.TableExists(tableName) {
			log.Printf("检测到表 %s 已存在，检查是否需要更新结构...", tableName)
			if err := db.UpdateTableSchema(tableName, nil, modelsFields); err != nil {
				log.Printf("警告：更新表结构失败：%v", err)
			}
		} else {
			if err := db.CreateTable(tableName, modelsFields); err != nil {
				db.Close()
				return nil, fmt.Errorf("创建表 %s 失败：%w", tableName, err)
			}
			log.Printf("已创建数据表：%s", tableName)
		}
	}

	// 热重载函数：重新读取配置并返回最新的 FormInfo 列表
	s.reloadFn = func() ([]handler.FormInfo, error) {
		newCfg, err := config.Load(s.configPath)
		if err != nil {
			return nil, err
		}
		return s.buildFormInfos(newCfg), nil
	}

	// 初始化处理器与路由
	h := handler.New(db, formInfos, configPath, s.reloadFn)
	if s.desktop {
		// 桌面端：分享链接优先使用对外 Web 监听的真实地址，
		// 避免生成 127.0.0.1 主监听端口（局域网无法访问）的链接
		h.SetShareURLBase(s.shareBaseURL)
	}
	var r *mux.Router
	if s.desktop {
		r = config.NewRouter(h, s)
	} else {
		r = config.NewRouter(h)
	}

	s.router = r

	for _, fi := range formInfos {
		log.Printf("表单已加载：%s (%s)", fi.Title, fi.Name)
	}

	return s, nil
}

// Start 启动 HTTP 服务（后台 goroutine），返回实际监听地址。
// 已在运行时通过 127.0.0.1:0 等方式指定随机端口时，返回值可用于日志或桌面端跳转。
func (s *Server) Start(opt Options) (string, error) {
	if s.started {
		return s.addr, nil
	}

	addr, srv, err := s.startListener(opt, s.router)
	if err != nil {
		return "", err
	}

	s.mu.Lock()
	s.servers = append(s.servers, srv)
	s.mu.Unlock()
	s.addr = addr
	s.started = true
	return s.addr, nil
}

// StartExtra 额外启动一个 HTTP 服务（与主服务共享同一路由），
// 供桌面端同时对外提供 Web 服务（如局域网访问）。重复调用返回当前地址。
func (s *Server) StartExtra(opt Options) (string, error) {
	if s.router == nil {
		return "", fmt.Errorf("路由尚未初始化")
	}

	s.extraMu.Lock()
	if s.extraSrv != nil {
		addr := s.extraAddr
		s.extraMu.Unlock()
		return addr, nil
	}
	s.extraMu.Unlock()

	addr, srv, err := s.startListener(opt, s.lanHandler())
	if err != nil {
		// 目标端口被占用时，自动改用同一主机上的空闲端口（端口传 0）
		if errors.Is(err, syscall.EADDRINUSE) {
			if host, _, splitErr := net.SplitHostPort(opt.Addr); splitErr == nil {
				fallback := Options{Addr: net.JoinHostPort(host, "0"), TLSCert: opt.TLSCert, TLSKey: opt.TLSKey}
				addr, srv, err = s.startListener(fallback, s.lanHandler())
				if err == nil {
					log.Printf("端口 %s 被占用，Web 服务已自动改用空闲端口 %s", opt.Addr, addr)
				}
			}
		}
		if err != nil {
			return "", err
		}
	}

	s.extraMu.Lock()
	s.extraSrv = srv
	s.extraAddr = addr
	s.extraMu.Unlock()
	s.mu.Lock()
	s.servers = append(s.servers, srv)
	s.mu.Unlock()
	return addr, nil
}

// StopExtra 停止额外启动的 Web 服务（幂等，未启动时直接返回 nil）。
func (s *Server) StopExtra() error {
	s.extraMu.Lock()
	srv := s.extraSrv
	s.extraSrv = nil
	s.extraAddr = ""
	s.extraMu.Unlock()
	if srv == nil {
		return nil
	}

	s.mu.Lock()
	for i, x := range s.servers {
		if x == srv {
			s.servers = append(s.servers[:i], s.servers[i+1:]...)
			break
		}
	}
	s.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return srv.Shutdown(ctx)
}

// lanHandler 返回用于对外（局域网）监听的路由：屏蔽桌面端专属接口
// （/api/desktop/*，如 Web 服务启停），避免局域网用户关闭本机服务。
// 其余接口（登录、表单、分享链接、管理后台等）原样转发。
func (s *Server) lanHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/desktop/") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"error":"该操作仅限本机桌面端"}`))
			return
		}
		s.router.ServeHTTP(w, r)
	})
}

// startListener 监听并启动一个 HTTP 服务（后台 goroutine），返回实际地址与服务实例。
func (s *Server) startListener(opt Options, handler http.Handler) (string, *http.Server, error) {
	listener, err := net.Listen("tcp", opt.Addr)
	if err != nil {
		return "", nil, fmt.Errorf("监听 %s 失败: %w", opt.Addr, err)
	}

	addr := listener.Addr().String()
	httpSrv := &http.Server{
		Addr:         addr,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go s.serve(listener, httpSrv, opt)
	return addr, httpSrv, nil
}

// serve 运行 HTTP 服务并把异常错误通知到 Errors() 通道（非阻塞，只通知一次）。
func (s *Server) serve(listener net.Listener, httpSrv *http.Server, opt Options) {
	var serveErr error
	if opt.TLSCert != "" && opt.TLSKey != "" {
		log.Printf("TLS 已启用，使用证书：%s", opt.TLSCert)
		serveErr = httpSrv.ServeTLS(listener, opt.TLSCert, opt.TLSKey)
	} else {
		serveErr = httpSrv.Serve(listener)
	}
	if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
		select {
		case s.serveErr <- serveErr:
		default:
		}
	}
}

// Addr 返回实际监听地址（Start 之后有效）。
func (s *Server) Addr() string {
	return s.addr
}

// Errors 返回 HTTP 服务异常退出的错误通道（正常关闭时不会收到值）。
func (s *Server) Errors() <-chan error {
	return s.serveErr
}

// WebListenAddr 返回配置中声明的 Web 监听地址（server.host:server.port）。
// 桌面端用它同时启动对外 Web 服务：默认 config.yaml 的 host 为 localhost，
// 仅本机可访问；把 host 改为 0.0.0.0（或用 GO_FORM_WEB_ADDR 覆盖）即可开放局域网。
func (s *Server) WebListenAddr() string {
	if s.cfg == nil || s.cfg.Server == nil {
		return ""
	}
	host := strings.TrimSpace(s.cfg.Server.Host)
	port := s.cfg.Server.Port
	if host == "" || port <= 0 {
		return ""
	}
	return net.JoinHostPort(host, strconv.Itoa(port))
}

// DesiredWebListenAddr 返回对外 Web 服务的期望监听地址：
//   - 优先 GO_FORM_WEB_ADDR 环境变量（可显式指定，如 127.0.0.1:8080 强制仅本机）；
//   - 其次 config.yaml 的 server.host:port；
//   - 主机为回环（localhost/127.0.0.1/::1）或空时，默认改为 0.0.0.0，
//     即桌面端启动 Web 服务默认开启局域网访问。
func (s *Server) DesiredWebListenAddr() string {
	if addr := strings.TrimSpace(os.Getenv("GO_FORM_WEB_ADDR")); addr != "" {
		return addr
	}
	addr := s.WebListenAddr()
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	normalized := strings.ToLower(strings.Trim(host, "[]"))
	switch normalized {
	case "", "localhost", "127.0.0.1", "::1":
		return net.JoinHostPort("0.0.0.0", port)
	}
	return addr
}

// WebServiceStatus 实现 config.WebServiceController。
func (s *Server) WebServiceStatus() config.WebServiceStatus {
	s.extraMu.Lock()
	defer s.extraMu.Unlock()

	status := config.WebServiceStatus{
		Available:  true,
		Configured: s.DesiredWebListenAddr(),
	}
	if s.extraSrv != nil {
		status.Running = true
		status.Addr = s.extraAddr
		if lan := LANURL(s.extraAddr); lan != "" {
			status.LANAddr = "http://" + lan
		}
	}
	return status
}

// shareBaseURL 返回分享链接应使用的基础地址：
//   - 额外 Web 监听已启动：局域网地址优先，否则用实际监听地址；
//   - 额外 Web 监听未启动：用窗口主监听的回环地址（至少本机可打开）。
func (s *Server) shareBaseURL() string {
	s.extraMu.Lock()
	extraRunning := s.extraSrv != nil
	extraAddr := s.extraAddr
	s.extraMu.Unlock()

	if extraRunning {
		if lan := LANURL(extraAddr); lan != "" {
			return "http://" + lan
		}
		return "http://" + extraAddr
	}
	if s.addr != "" {
		return "http://" + s.addr
	}
	return ""
}

// StartWebService 实现 config.WebServiceController。
func (s *Server) StartWebService() (config.WebServiceStatus, error) {
	addr := s.DesiredWebListenAddr()
	if addr == "" {
		return s.WebServiceStatus(), fmt.Errorf("未配置 Web 服务地址（请设置 server.host/port 或 GO_FORM_WEB_ADDR）")
	}
	if _, err := s.StartExtra(Options{Addr: addr}); err != nil {
		return s.WebServiceStatus(), err
	}
	return s.WebServiceStatus(), nil
}

// StopWebService 实现 config.WebServiceController。
func (s *Server) StopWebService() (config.WebServiceStatus, error) {
	if err := s.StopExtra(); err != nil {
		return s.WebServiceStatus(), err
	}
	return s.WebServiceStatus(), nil
}

// LANURL 把 "0.0.0.0:8080" 之类的监听地址换成便于局域网访问的本机 IP 地址；
// 非通配地址原样返回。
func LANURL(addr string) string {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return ""
	}
	if host != "" && host != "0.0.0.0" && host != "::" {
		return ""
	}
	if ip := firstLocalIPv4(); ip != "" {
		return net.JoinHostPort(ip, port)
	}
	return addr
}

// firstLocalIPv4 返回本机第一个非回环 IPv4 地址（用于打印局域网访问地址）。
func firstLocalIPv4() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return ""
	}

	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			if ipv4 := ip.To4(); ipv4 != nil {
				return ipv4.String()
			}
		}
	}

	return ""
}

// Shutdown 优雅关闭 HTTP 服务并关闭数据库。
func (s *Server) Shutdown(ctx context.Context) error {
	var errs []error
	s.mu.Lock()
	servers := append([]*http.Server(nil), s.servers...)
	s.mu.Unlock()
	for _, srv := range servers {
		if err := srv.Shutdown(ctx); err != nil {
			errs = append(errs, err)
		}
	}
	if s.db != nil {
		if err := s.db.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// buildFormInfos 将配置表单转换为 handler.FormInfo 列表。
func (s *Server) buildFormInfos(cfg *config.Config) []handler.FormInfo {
	formInfos := make([]handler.FormInfo, 0, len(cfg.Forms))
	for _, fc := range cfg.Forms {
		fields := config.ToFieldInfos(fc.Fields)

		tableName := ""
		if fc.Model != nil {
			tableName = fc.Model.TableName
		}
		if tableName == "" {
			tableName = "form_" + fc.Name
		}

		formInfos = append(formInfos, handler.FormInfo{
			Name:                fc.Name,
			Title:               fc.Title,
			Description:         fc.Description,
			Category:            fc.Category,
			Pinned:              fc.Pinned,
			SortOrder:           fc.SortOrder,
			Priority:            fc.Priority,
			Status:              fc.Status,
			PublishAt:           fc.PublishAt,
			ExpireAt:            fc.ExpireAt,
			DataDirectory:       "",
			Model:               struct{ TableName string }{TableName: tableName},
			Fields:              fields,
			WeightSumTotalLimit: fc.WeightSumTotalLimit,
			Scoring:             config.ToScoringInfo(fc.Scoring),
			FileModTime:         fc.FileModTime,
			ConfigSource:        fc.ConfigSource,
		})
	}
	return formInfos
}

// toModelsFields 将 handler.FieldInfo 转换为 models.FieldInfo。
func toModelsFields(fields []handler.FieldInfo) []models.FieldInfo {
	modelsFields := make([]models.FieldInfo, len(fields))
	for i, f := range fields {
		modelsFields[i] = models.FieldInfo{
			Name:        f.Name,
			Label:       f.Label,
			Type:        f.Type,
			Placeholder: f.Placeholder,
			Required:    f.Required,
			Options:     f.Options,
			Min:         f.Min,
			Max:         f.Max,
			Step:        f.Step,
		}
	}
	return modelsFields
}

func ensureRuntimeDirs(dbPath string) error {
	if dbPath == "" {
		return fmt.Errorf("ensureRuntimeDirs: dbPath must not be empty")
	}

	absDBPath, err := filepath.Abs(dbPath)
	if err != nil {
		return fmt.Errorf("ensureRuntimeDirs: resolve absolute path for %q: %w", dbPath, err)
	}

	if err := os.MkdirAll("data", 0755); err != nil {
		return fmt.Errorf("ensureRuntimeDirs: create data directory: %w", err)
	}

	dbDir := filepath.Dir(absDBPath)
	if dbDir != "." && dbDir != "" {
		if err := os.MkdirAll(dbDir, 0755); err != nil {
			return fmt.Errorf("ensureRuntimeDirs: create database directory %q: %w", dbDir, err)
		}
	}

	return nil
}
