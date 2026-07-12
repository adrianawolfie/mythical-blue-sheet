package storage

import (
	"context"
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

func (l local) Reader(ctx context.Context, path string) (io.ReadCloser, error) {
	return os.OpenFile(filepath.Join(l.dir, path), os.O_CREATE|os.O_RDONLY, 0644)
}

func (l local) Writer(ctx context.Context, path string) (io.WriteCloser, error) {
	fullPath := filepath.Join(l.dir, path)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create directory: %w", err)
	}
	return os.OpenFile(fullPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
}

func (l local) Delete(ctx context.Context, path string) error {
	return os.Remove(filepath.Join(l.dir, path))
}
