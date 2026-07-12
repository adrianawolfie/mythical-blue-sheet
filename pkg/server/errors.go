package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

func renderErrorPage(w http.ResponseWriter, err error) {
	w.WriteHeader(http.StatusInternalServerError)
	slog.Error("error rendering page", "error", err)
	_, _ = w.Write([]byte(err.Error()))
}

func writeError(w http.ResponseWriter, err error) {
	w.WriteHeader(http.StatusInternalServerError)
	slog.Error("error rendering page", "error", err)
	json.NewEncoder(w).Encode(struct {
		Error string `json:"error"`
	}{
		Error: err.Error(),
	})
}
