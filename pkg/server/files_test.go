package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestFileServer(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "page.html"), []byte("html page"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "plain"), []byte("plain file"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "preferred"), []byte("plain preferred file"), 0o644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "preferred.html"), []byte("preferred html page"), 0o644))

	tests := []struct {
		name       string
		path       string
		statusCode int
		body       string
	}{
		{name: "existing file", path: "/plain", statusCode: http.StatusOK, body: "plain file"},
		{name: "extensionless HTML path", path: "/page", statusCode: http.StatusOK, body: "html page"},
		{name: "HTML preferred over extensionless file", path: "/preferred", statusCode: http.StatusOK, body: "preferred html page"},
		{name: "explicit HTML path", path: "/page.html", statusCode: http.StatusOK, body: "html page"},
		{name: "missing extensionless path", path: "/missing", statusCode: http.StatusNotFound, body: "404 page not found\n"},
		{name: "missing path with extension", path: "/missing.css", statusCode: http.StatusNotFound, body: "404 page not found\n"},
	}

	handler := FileServer(http.Dir(dir))
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, tt.path, nil)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			require.Equal(t, tt.statusCode, response.Code)
			require.Equal(t, tt.body, response.Body.String())
		})
	}
}
