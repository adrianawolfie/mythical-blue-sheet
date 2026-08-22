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

func TestFileServerServesStaticCharacterDetailPageWithQuery(t *testing.T) {
	chdirRepoRoot(t)
	request := httptest.NewRequest(http.MethodGet, "/character.html?id=ada-character", nil)
	response := httptest.NewRecorder()

	FileServer(http.Dir("public")).ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	require.Contains(t, response.Body.String(), `<body class="character-detail-page">`)
	require.Contains(t, response.Body.String(), `<script src="js/character-detail.js"></script>`)
	require.Contains(t, response.Body.String(), `id="undoCharacterForm"`)
	require.Contains(t, response.Body.String(), `id="copyCharacterBtn"`)
	require.NotContains(t, response.Body.String(), "window.__MYTHICAL_BLUE_CHARACTER__")
	require.NotContains(t, response.Body.String(), "{{")
}

func TestCharacterSheetPagesIncludeCopyControl(t *testing.T) {
	chdirRepoRoot(t)
	for _, file := range []string{"index.html", "character.html"} {
		contents, err := os.ReadFile(filepath.Join("public", file))
		require.NoError(t, err)
		require.Contains(t, string(contents), `id="copyCharacterBtn"`)
		require.Contains(t, string(contents), `aria-label="Copy character"`)
	}
	storageAdapter, err := os.ReadFile(filepath.Join("public", "js", "storage-adapter.js"))
	require.NoError(t, err)
	require.Contains(t, string(storageAdapter), "/api/characters/${encodeURIComponent(id)}/copy")
}

func TestFileServerServesStaticCharacterListPage(t *testing.T) {
	chdirRepoRoot(t)
	request := httptest.NewRequest(http.MethodGet, "/characters.html", nil)
	response := httptest.NewRecorder()

	FileServer(http.Dir("public")).ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	require.Contains(t, response.Body.String(), `id="characterList"`)
	require.Contains(t, response.Body.String(), `<script src="/js/characters.js"></script>`)
	require.NotContains(t, response.Body.String(), "{{")
	charactersJS, err := os.ReadFile(filepath.Join("public", "js", "characters.js"))
	require.NoError(t, err)
	require.Contains(t, string(charactersJS), "/api/characters?owned=1")
}

func TestFileServerServesStaticAuthPages(t *testing.T) {
	chdirRepoRoot(t)
	tests := []struct {
		path     string
		content  string
		action   string
		pageLink string
	}{
		{path: "/login.html", content: "Crew Login", action: `action="/api/login"`, pageLink: `href="/register.html"`},
		{path: "/register.html", content: "Create Account", action: `action="/api/register"`, pageLink: `href="/login.html"`},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, tt.path, nil)
			response := httptest.NewRecorder()
			FileServer(http.Dir("public")).ServeHTTP(response, request)

			require.Equal(t, http.StatusOK, response.Code)
			require.Contains(t, response.Body.String(), tt.content)
			require.Contains(t, response.Body.String(), tt.action)
			require.Contains(t, response.Body.String(), tt.pageLink)
			require.NotContains(t, response.Body.String(), "{{")
		})
	}
}

func TestFileServerServesStaticAdminVersionsPage(t *testing.T) {
	chdirRepoRoot(t)
	request := httptest.NewRequest(http.MethodGet, "/admin/versions.html?id=ada-character", nil)
	response := httptest.NewRecorder()

	FileServer(http.Dir("public")).ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	require.Contains(t, response.Body.String(), `id="adminVersionsBody"`)
	require.Contains(t, response.Body.String(), `<script src="/admin/versions.js"></script>`)
	require.NotContains(t, response.Body.String(), "{{")
	charactersPage, err := os.ReadFile(filepath.Join("public", "admin", "characters.html"))
	require.NoError(t, err)
	require.Contains(t, string(charactersPage), "<th>Versions</th>")
	charactersJS, err := os.ReadFile(filepath.Join("public", "admin", "characters.js"))
	require.NoError(t, err)
	require.Contains(t, string(charactersJS), "/admin/versions.html?id=")
}
