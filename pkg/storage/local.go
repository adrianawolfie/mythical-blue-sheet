package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

type local struct {
	dir string
}

func New(dir string) (Storage, error) {
	if err := os.MkdirAll(filepath.Dir(dir), 0755); err != nil && !os.IsExist(err) {
		return local{}, fmt.Errorf("failed to create directory: %w", err)
	}
	return local{
		dir: dir,
	}, nil
}

func (l local) Reader(path string) (io.ReadCloser, error) {
	return os.OpenFile(filepath.Join(l.dir, path), os.O_CREATE|os.O_RDONLY, 0644)
}

func (l local) Writer(path string) (io.WriteCloser, error) {
	return os.OpenFile(filepath.Join(l.dir, path), os.O_CREATE|os.O_RDWR, 0644)
}
