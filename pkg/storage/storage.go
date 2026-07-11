package storage

import "io"

type Storage interface {
	Reader(string) (io.ReadCloser, error)
	Writer(string) (io.WriteCloser, error)
}
