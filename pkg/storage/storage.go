package storage

import (
	"context"
	"io"
)

type Storage interface {
	Reader(context.Context, string) (io.ReadCloser, error)
	Writer(context.Context, string) (io.WriteCloser, error)
	Delete(context.Context, string) error
}
