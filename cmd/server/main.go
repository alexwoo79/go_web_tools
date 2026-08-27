package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"go-web/internal/app"
)

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

func main() {
	configPath := flag.String("config", "config.yaml", "配置文件路径")
	port := flag.String("port", "8080", "服务端口")
	tlsCert := flag.String("tls-cert", "", "TLS 证书文件路径（与 --tls-key 同时提供时启用 HTTPS）")
	tlsKey := flag.String("tls-key", "", "TLS 私钥文件路径（与 --tls-cert 同时启用时启用 HTTPS）")
	flag.Parse()

	// 初始化后端：配置加载、数据库、动态建表与路由
	backend, err := app.New(*configPath)
	if err != nil {
		log.Fatalf("%v", err)
	}

	// 启动 HTTP 服务
	listenAddr := fmt.Sprintf("0.0.0.0:%s", *port)
	actualAddr, err := backend.Start(app.Options{
		Addr:    listenAddr,
		TLSCert: *tlsCert,
		TLSKey:  *tlsKey,
	})
	if err != nil {
		log.Fatalf("服务器启动失败：%v", err)
	}

	log.Printf("服务器启动成功，监听地址：%s", actualAddr)
	if ip := firstLocalIPv4(); ip != "" {
		log.Printf("访问：http://%s:%s", ip, *port)
		log.Printf("管理后台：http://%s:%s/admin", ip, *port)
	} else {
		log.Printf("访问：http://localhost:%s", *port)
		log.Printf("管理后台：http://localhost:%s/admin", *port)
	}

	// 捕获 SIGINT / SIGTERM，实现优雅关机
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	select {
	case err := <-backend.Errors():
		if err != nil {
			log.Fatalf("服务器异常退出：%v", err)
		}
	case <-ctx.Done():
		log.Printf("收到退出信号，开始优雅关机...")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := backend.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Printf("服务器关闭时发生错误：%v", err)
	}
	log.Printf("服务器已关闭")
}
