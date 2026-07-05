package server

import (
	"log/slog"
	"net/http"
)

func renderErrorPage(w http.ResponseWriter, err error) {
	w.WriteHeader(http.StatusInternalServerError)
	slog.Error("error rendering page", "error", err)
	_, _ = w.Write([]byte(err.Error()))
}
