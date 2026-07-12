package s3

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriterReplacesExistingObject(t *testing.T) {
	var putBody []byte
	var getCount int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			getCount++
			_, _ = w.Write([]byte(`{"name":"Long Character Name"}`))
		case http.MethodPut:
			var err error
			putBody, err = io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read put body: %v", err)
			}
			w.WriteHeader(http.StatusOK)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer server.Close()

	c := &Client{
		endpoint:   server.URL,
		accessKey:  "key",
		secretKey:  "secret",
		httpClient: server.Client(),
	}

	w, err := c.Writer(context.Background(), "character/ada.json")
	if err != nil {
		t.Fatalf("writer: %v", err)
	}
	if _, err := w.Write([]byte(`{"name":`)); err != nil {
		t.Fatalf("write first chunk: %v", err)
	}
	if _, err := w.Write([]byte(`"Ada"}`)); err != nil {
		t.Fatalf("write second chunk: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	if getCount != 0 {
		t.Fatalf("writer should not load existing object, got %d GET requests", getCount)
	}
	if string(putBody) != `{"name":"Ada"}` {
		t.Fatalf("expected replacement only, got %q", putBody)
	}
}
