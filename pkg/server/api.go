package server

import (
	"encoding/json"
	"net/http"
)

const maxJSONBytes int64 = 5 * 1024 * 1024

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
