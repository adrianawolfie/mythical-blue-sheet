package main

import (
	"context"
	"log"
	"net/http"
	"raperonzolo/character-sheet/pkg/campaign"
	"raperonzolo/character-sheet/pkg/character"
	"raperonzolo/character-sheet/pkg/config"
	"raperonzolo/character-sheet/pkg/server"
	"raperonzolo/character-sheet/pkg/statblock"
	"raperonzolo/character-sheet/pkg/storage"
	"raperonzolo/character-sheet/pkg/storage/s3"
	"raperonzolo/character-sheet/pkg/user"
)

func main() {
	config.Load()

	ctx := context.Background()

	var (
		s   storage.Storage
		err error
	)

	if config.Storage == "s3" {
		log.Println("using s3 storage")
		s, err = s3.New()
	} else {
		log.Println("using local storage")
		s, err = storage.New("data")
	}
	if err != nil {
		log.Fatal(err)
	}

	users, err := user.NewRepository(ctx, s)
	if err != nil {
		log.Fatal(err)
	}

	characters, err := character.NewRepository(ctx, s)
	if err != nil {
		log.Fatal(err)
	}

	campaigns, err := campaign.NewRepository(ctx, s)
	if err != nil {
		log.Fatal(err)
	}

	statblocks, err := statblock.NewRepository(ctx, s)
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.Dir("public")))

	// user routes
	mux.Handle("GET /login", server.GetLogin())
	mux.Handle("POST /login", server.PostLogin(users))
	mux.Handle("GET /register", server.GetRegistration())
	mux.Handle("POST /users", server.PostUser(users))
	mux.Handle("GET /admin", server.GetAdmin())
	mux.Handle("GET /admin/users", server.GetAdminUsers(users))
	mux.Handle("GET /admin/characters", server.GetAdminCharacters(users, characters))
	mux.Handle("GET /admin/campaigns", server.GetAdminCampaigns(users, campaigns))

	// character routes
	mux.Handle("GET /api/characters", server.GetCharacters(characters))
	mux.Handle("GET /api/characters/{id}", server.GetCharacter(characters))
	mux.Handle("POST /api/characters", server.PostCharacters(characters))
	mux.Handle("POST /api/characters/{id}/status", server.PostStatus(characters))
	mux.Handle("DELETE /api/characters/{id}", server.DeleteCharacter(characters))

	// campaign routes
	mux.Handle("GET /api/campaign-state", server.GetCampaignState(campaigns))
	mux.Handle("POST /api/campaign-state", server.PostCampaignState(campaigns))

	// statblock routes
	mux.Handle("GET /api/custom-statblocks", server.GetCustomStatblocks(statblocks))
	mux.Handle("POST /api/custom-statblocks", server.PostCustomStatblocks(statblocks))

	handler := server.LimitPostBody(mux)

	log.Println("listening on :8080")
	if err := http.ListenAndServe(":8080", handler); err != nil {
		log.Fatal(err)
	}
}
