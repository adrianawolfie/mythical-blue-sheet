package server

import (
	"net/http"
	"path"
)

func FileServer(root http.FileSystem) http.Handler {
	return http.FileServer(htmlFileSystem{root: root})
}

type htmlFileSystem struct {
	root http.FileSystem
}

func (f htmlFileSystem) Open(name string) (http.File, error) {
	if path.Ext(name) == "" {
		file, err := f.root.Open(name + ".html")
		if err == nil {
			return file, nil
		}
	}

	return f.root.Open(name)
}
