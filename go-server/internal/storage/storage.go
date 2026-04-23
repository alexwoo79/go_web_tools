package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

type Storage interface {
	Save(name string, r io.Reader) (string, error)
	Open(id string) (io.ReadCloser, error)
	List() ([]FileMeta, error)
	URL(id string) string
}

type FileMeta struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Size       int64     `json:"size"`
	UploadedAt time.Time `json:"uploadedAt"`
}

type LocalStorage struct {
	base string
}

func NewLocalStorage(base string) *LocalStorage {
	_ = os.MkdirAll(base, 0o755)
	return &LocalStorage{base: base}
}

func (s *LocalStorage) Save(name string, r io.Reader) (string, error) {
	id := fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(name))
	dst := filepath.Join(s.base, id)
	f, err := os.Create(dst)
	if err != nil {
		return "", err
	}
	defer f.Close()
	n, err := io.Copy(f, r)
	if err != nil {
		return "", err
	}
	_ = f.Sync()
	_ = os.Chmod(dst, 0o644)
	_ = os.Chtimes(dst, time.Now(), time.Now())
	_ = os.Truncate(dst, n) // noop if size matches
	return id, nil
}

func (s *LocalStorage) Open(id string) (io.ReadCloser, error) {
	p := filepath.Join(s.base, id)
	return os.Open(p)
}

func (s *LocalStorage) List() ([]FileMeta, error) {
	var out []FileMeta
	entries, err := os.ReadDir(s.base)
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		fi, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, FileMeta{ID: e.Name(), Name: e.Name(), Size: fi.Size(), UploadedAt: fi.ModTime()})
	}
	return out, nil
}

func (s *LocalStorage) URL(id string) string {
	// For PoC, return a path-like URL
	return "/data/uploads/" + id
}
