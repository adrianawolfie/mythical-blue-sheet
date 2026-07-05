package main

import (
	"log"
	"net/http"
	"path/filepath"
	"raperonzolo/character-sheet/pkg/config"
	"raperonzolo/character-sheet/pkg/s3"
	"raperonzolo/character-sheet/pkg/server"
	"raperonzolo/character-sheet/pkg/users"
)

func main() {
	config.Load()

	client, err := s3.New()
	if err != nil {
		log.Fatal(err)
	}

	userRepository, err := users.New(users.WithS3(client, "users.jsonl"))
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.Handle("/config.js", server.NewConfigHandler())
	apiHandler, err := server.NewAPIHandler(client, filepath.Join("public"), filepath.Join("data"))
	if err != nil {
		log.Fatal(err)
	}
	mux.Handle("/api/", apiHandler)
	mux.Handle("/", http.FileServer(http.Dir("public")))
	mux.Handle("GET /login", server.GetLogin())
	mux.Handle("POST /login", server.PostLogin(userRepository))
	mux.Handle("GET /register", server.GetRegistration())
	mux.Handle("POST /users", server.PostUser(userRepository))

	log.Println("listening on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
