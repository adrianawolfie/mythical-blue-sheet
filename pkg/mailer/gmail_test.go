package mailer

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGmailSendRefreshesTokenAndSendsMessage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			if err := r.ParseForm(); err != nil {
				t.Errorf("parse token form: %v", err)
			}
			if r.Form.Get("grant_type") != "refresh_token" || r.Form.Get("refresh_token") != "refresh" {
				t.Errorf("unexpected OAuth form: %v", r.Form)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"access_token":"access"}`)
		case "/send":
			if r.Header.Get("Authorization") != "Bearer access" {
				t.Errorf("unexpected authorization header %q", r.Header.Get("Authorization"))
			}
			var request struct {
				Raw string `json:"raw"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Errorf("decode send request: %v", err)
			}
			message, err := base64.RawURLEncoding.DecodeString(request.Raw)
			if err != nil {
				t.Errorf("decode message: %v", err)
			}
			for _, want := range []string{"From: <sender@example.com>", "To: <player@example.com>", "Subject: Reset password", "reset body"} {
				if !strings.Contains(string(message), want) {
					t.Errorf("message missing %q: %s", want, message)
				}
			}
			w.WriteHeader(http.StatusOK)
		default:
			t.Errorf("unexpected request path %q", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	sender := NewGmail("client", "secret", "refresh", "sender@example.com")
	sender.client = server.Client()
	sender.tokenURL = server.URL + "/token"
	sender.sendURL = server.URL + "/send"
	if err := sender.Send("player@example.com", "Reset password", "reset body"); err != nil {
		t.Fatalf("send email: %v", err)
	}
}

func TestGmailRequiresOAuthConfiguration(t *testing.T) {
	if err := NewGmail("", "", "", "").Send("player@example.com", "subject", "body"); err == nil {
		t.Fatal("expected missing configuration to fail")
	}
}
