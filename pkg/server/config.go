package server

import (
	"fmt"
	"net/http"
	"os"
	"strings"
)

func NewConfigHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript")
		w.Header().Set("Cache-Control", "no-store")

		mode := strings.TrimSpace(os.Getenv("MYTHICAL_BLUE_STORAGE_MODE"))
		switch mode {
		case "local", "api":
		default:
			mode = "api"
		}

		_, _ = fmt.Fprintf(w, "window.APP_CONFIG = window.APP_CONFIG || {}; window.APP_CONFIG.storageMode = %q;\n", mode)
	})
}
