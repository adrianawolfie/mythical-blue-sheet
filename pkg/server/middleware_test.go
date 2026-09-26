package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCORSAllowsConfiguredOrigin(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := CORS(next)

	request := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	request.Header.Set("Origin", "https://raperonzolo-app-test-xwpvf.ondigitalocean.app")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, "https://raperonzolo-app-test-xwpvf.ondigitalocean.app", response.Header().Get("Access-Control-Allow-Origin"))
	require.Equal(t, "true", response.Header().Get("Access-Control-Allow-Credentials"))
	require.Equal(t, "Origin", response.Header().Get("Vary"))
}

func TestCORSHandlesAllowedPreflight(t *testing.T) {
	nextCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
	})
	handler := CORS(next)

	request := httptest.NewRequest(http.MethodOptions, "/api/characters", nil)
	request.Header.Set("Origin", "https://test.raperonzolo.com")
	request.Header.Set("Access-Control-Request-Method", http.MethodPatch)
	request.Header.Set("Access-Control-Request-Headers", "content-type")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	require.Equal(t, http.StatusNoContent, response.Code)
	require.False(t, nextCalled)
	require.Equal(t, "https://test.raperonzolo.com", response.Header().Get("Access-Control-Allow-Origin"))
	require.Equal(t, "true", response.Header().Get("Access-Control-Allow-Credentials"))
	require.Equal(t, "GET, POST, PUT, PATCH, DELETE, OPTIONS", response.Header().Get("Access-Control-Allow-Methods"))
	require.Equal(t, "Accept, Content-Type", response.Header().Get("Access-Control-Allow-Headers"))
}

func TestCORSRejectsDisallowedPreflight(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("next handler should not be called")
	})
	handler := CORS(next)

	request := httptest.NewRequest(http.MethodOptions, "/api/me", nil)
	request.Header.Set("Origin", "https://example.com")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	require.Equal(t, http.StatusForbidden, response.Code)
	require.Empty(t, response.Header().Get("Access-Control-Allow-Origin"))
}

func TestCORSLeavesRequestsWithoutOriginUnchanged(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	})
	handler := CORS(next)

	request := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	require.Equal(t, http.StatusAccepted, response.Code)
	require.Empty(t, response.Header().Get("Access-Control-Allow-Origin"))
}
