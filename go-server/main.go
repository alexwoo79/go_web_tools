package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"

	"github.com/example/go_server_poc/internal/api"
	"github.com/example/go_server_poc/internal/storage"
)

func main() {
	storagePath := os.Getenv("STORAGE_PATH")
	if storagePath == "" {
		storagePath = "./data/uploads"
	}
	store := storage.NewLocalStorage(storagePath)

	r := gin.Default()

	apiGroup := r.Group("/api/analytics")
	api.RegisterUpload(apiGroup, store)
	api.RegisterFiles(apiGroup, store)
	api.RegisterTasks(apiGroup, store)

	// simple health
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

	log.Println("Starting go-server on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
