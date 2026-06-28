package main

import (
	"log"
	"net/http"
	"path/filepath"

	"raperonzolo/character-sheet/pkg/server"

	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Skipping .env")
	}

	mux := http.NewServeMux()
	mux.Handle("/config.js", server.NewConfigHandler())
	apiHandler, err := server.NewAPIHandler(filepath.Join("public"))
	if err != nil {
		log.Fatal(err)
	}
	mux.Handle("/api/", apiHandler)
	mux.Handle("/", http.FileServer(http.Dir("public")))

	log.Println("listening on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatal(err)
	}
}
