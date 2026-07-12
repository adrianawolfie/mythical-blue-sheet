package server

import "net/http"

func LimitPostBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			r.Body = http.MaxBytesReader(w, r.Body, maxJSONBytes)
		}
		next.ServeHTTP(w, r)
	})
}
