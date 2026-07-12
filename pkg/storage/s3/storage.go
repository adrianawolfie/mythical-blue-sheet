package s3

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
)

type readWriterCloser struct {
	client *Client
	path   string
	mu     sync.Mutex
	data   []byte
	offset int
	loaded bool
	write  bool
	closed bool
}

func (rw *readWriterCloser) Read(p []byte) (n int, err error) {
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

func (rw *readWriterCloser) Write(p []byte) (n int, err error) {
	rw.mu.Lock()
	defer rw.mu.Unlock()

	if !rw.write {
		return 0, fmt.Errorf("s3 reader is not writable")
	}
	if rw.closed {
		return 0, fmt.Errorf("s3 writer is closed")
	}
	if len(p) == 0 {
		return 0, nil
	}

	rw.data = append(rw.data, p...)
	return len(p), nil
}

func (rw *readWriterCloser) Close() error {
	rw.mu.Lock()
	defer rw.mu.Unlock()

	if rw.closed {
		return nil
	}
	rw.closed = true
	if !rw.write {
		return nil
	}
	if rw.client == nil {
		return fmt.Errorf("s3 read writer client is nil")
	}

	if err := rw.client.Put(context.Background(), rw.path, rw.data); err != nil {
		return err
	}
	return nil
}

func (rw *readWriterCloser) load() error {
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
