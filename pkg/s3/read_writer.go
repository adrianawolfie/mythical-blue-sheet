package s3

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
)

type ReadWriter struct {
	client *Client
	path   string
	mu     sync.Mutex
	data   []byte
	offset int
	loaded bool
}

func NewReadWriter(client *Client, path string) *ReadWriter {
	return &ReadWriter{client: client, path: path}
}

func (rw *ReadWriter) Read(p []byte) (n int, err error) {
	rw.mu.Lock()
	defer rw.mu.Unlock()

	if err := rw.load(); err != nil {
		return 0, err
	}

	if rw.offset >= len(rw.data) {
		return 0, io.EOF
	}

	n = copy(p, rw.data[rw.offset:])
	rw.offset += n
	return n, nil
}

func (rw *ReadWriter) Write(p []byte) (n int, err error) {
	rw.mu.Lock()
	defer rw.mu.Unlock()

	if len(p) == 0 {
		return 0, nil
	}

	if err := rw.load(); err != nil {
		return 0, err
	}

	next := make([]byte, 0, len(rw.data)+len(p))
	next = append(next, rw.data...)
	next = append(next, p...)

	if err := rw.client.Put(context.Background(), rw.path, next); err != nil {
		return 0, err
	}

	rw.data = next
	return len(p), nil
}

func (rw *ReadWriter) load() error {
	if rw.loaded {
		return nil
	}
	if rw.client == nil {
		return fmt.Errorf("s3 read writer client is nil")
	}

	data, err := rw.client.Get(context.Background(), rw.path)
	if errors.Is(err, ErrNotFound) {
		data = nil
	} else if err != nil {
		return err
	}

	rw.data = data
	rw.loaded = true
	return nil
}
