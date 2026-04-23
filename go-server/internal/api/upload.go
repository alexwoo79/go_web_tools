package api

import (
	"net/http"

	"github.com/example/go_server_poc/internal/storage"
	"github.com/gin-gonic/gin"
)

func RegisterUpload(rg *gin.RouterGroup, store storage.Storage) {
	rg.POST("/upload", func(c *gin.Context) {
		file, header, err := c.Request.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		defer file.Close()
		id, err := store.Save(header.Filename, file)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"fileID": id})
	})
}
