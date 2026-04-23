package api

import (
	"io"
	"net/http"

	"github.com/example/go_server_poc/internal/storage"
	"github.com/gin-gonic/gin"
)

func RegisterFiles(rg *gin.RouterGroup, store storage.Storage) {
	rg.GET("/files", func(c *gin.Context) {
		list, err := store.List()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, list)
	})

	rg.GET("/files/:id", func(c *gin.Context) {
		id := c.Param("id")
		rc, err := store.Open(id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		defer rc.Close()
		c.Writer.Header().Set("Content-Disposition", "attachment; filename="+id)
		c.Writer.WriteHeader(http.StatusOK)
		_, _ = io.Copy(c.Writer, rc)
	})
}
