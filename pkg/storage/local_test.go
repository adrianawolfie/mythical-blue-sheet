package storage

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestLocalWriterReplacesExistingFile(t *testing.T) {
	dir := t.TempDir()
	s, err := New(dir)
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}

	ctx := context.Background()
	w, err := s.Writer(ctx, "nested/file.json")
	if err != nil {
		t.Fatalf("writer: %v", err)
	}
	if _, err := w.Write([]byte(`{"name":"Long Character Name"}`)); err != nil {
		t.Fatalf("write long content: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("close long content: %v", err)
	}

	w, err = s.Writer(ctx, "nested/file.json")
	if err != nil {
		t.Fatalf("writer replacement: %v", err)
	}
	if _, err := w.Write([]byte(`{"name":"Ada"}`)); err != nil {
		t.Fatalf("write replacement: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("close replacement: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dir, "nested", "file.json"))
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	if string(data) != `{"name":"Ada"}` {
		t.Fatalf("expected replacement only, got %q", data)
	}
}
