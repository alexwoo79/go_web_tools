package api

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "sync"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/example/go_server_poc/internal/storage"
)

type TaskStatus struct {
    ID string `json:"id"`
    Status string `json:"status"`
    ResultURL string `json:"resultUrl,omitempty"`
}

var (
    tasksMu sync.Mutex
    tasks = map[string]*TaskStatus{}
)

func RegisterTasks(rg *gin.RouterGroup, store storage.Storage) {
    rg.POST("/tasks", func(c *gin.Context) {
        var req struct{ FileID string `json:"fileID"` }
        if err := c.BindJSON(&req); err != nil { c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()}); return }
        id := fmt.Sprintf("task-%d", time.Now().UnixNano())
        ts := &TaskStatus{ID: id, Status: "queued"}
        tasksMu.Lock(); tasks[id]=ts; tasksMu.Unlock()

        // async execute: call plumber render endpoint
        go func(taskID, fileID string) {
            update := func(st string, url string) {
                tasksMu.Lock(); defer tasksMu.Unlock(); if t, ok := tasks[taskID]; ok { t.Status = st; t.ResultURL = url }
            }
            update("running", "")
            payload, _ := json.Marshal(map[string]string{"fileID": fileID})
            // call plumber service
            resp, err := http.Post("http://shiny-plumber:8000/render_report", "application/json", bytes.NewReader(payload))
            if err != nil {
                update("failed", "")
                return
            }
            defer resp.Body.Close()
            var out struct{ Result string `json:"result"` }
            _ = json.NewDecoder(resp.Body).Decode(&out)
            update("done", out.Result)
        }(id, req.FileID)

        c.JSON(http.StatusAccepted, gin.H{"taskID": id})
    })

    rg.GET("/tasks/:id", func(c *gin.Context) {
        id := c.Param("id")
        tasksMu.Lock(); t, ok := tasks[id]; tasksMu.Unlock()
        if !ok { c.JSON(http.StatusNotFound, gin.H{"error":"not found"}); return }
        c.JSON(http.StatusOK, t)
    })
}
