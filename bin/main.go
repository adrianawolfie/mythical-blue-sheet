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
	mux.Handle("/", server.FileServer(http.Dir("public")))

	// user routes
	mux.Handle("POST /api/login", server.PostLogin(users))
	mux.Handle("POST /api/register", server.PostRegister(users))
	mux.Handle("GET /api/me", server.GetCurrentUser(users))
	mux.Handle("PUT /api/me", server.PutCurrentUser(users))
	mux.Handle("GET /api/admin/users", server.GetAdminUsersData(users))
	mux.Handle("PUT /api/admin/users/{id}", server.PutAdminUser(users))
	mux.Handle("GET /api/admin/characters", server.GetAdminCharactersData(users, characters))
	mux.Handle("POST /api/admin/characters/{id}/assignment", server.PostAdminCharacterAssignment(users, characters))
	mux.Handle("DELETE /api/admin/characters/{id}", server.DeleteAdminCharacter(users, characters))
	mux.Handle("GET /api/admin/campaigns", server.GetAdminCampaignsData(users, campaigns))
	mux.Handle("POST /api/admin/campaigns/{id}/players", server.PostAdminCampaignPlayer(users, campaigns))
	mux.Handle("DELETE /api/admin/campaigns/{id}/players/{userId}", server.DeleteAdminCampaignPlayer(users, campaigns))
	mux.Handle("PUT /api/admin/campaigns/{id}/dm", server.PutAdminCampaignDM(users, campaigns))

	// character routes
	mux.Handle("GET /api/characters", server.GetCharacters(characters, users))
	mux.Handle("GET /api/characters/{id}", server.GetCharacter(characters))
	mux.Handle("POST /api/characters", server.PostCharacters(characters))
	mux.Handle("GET /api/characters/{id}/live", server.GetCharacterLive(characters))
	mux.Handle("PATCH /api/characters/{id}/live", server.PatchCharacterLive(characters))
	mux.Handle("GET /api/characters/{id}/history", server.GetCharacterHistory(characters))
	mux.Handle("GET /api/characters/{id}/history/{version}", server.GetCharacterHistoryVersion(characters))
	mux.Handle("POST /api/characters/{id}/history/{version}/restore", server.RestoreCharacterHistoryVersion(characters))
	mux.Handle("DELETE /api/characters/{id}", server.DeleteCharacter(characters))

	// campaign routes
	mux.Handle("GET /api/campaigns", server.GetCampaigns(users, campaigns))
	mux.Handle("GET /api/campaign-state", server.GetCampaign(campaigns))
	mux.Handle("POST /api/campaign-state", server.PostCampaign(campaigns))

	// statblock routes
	mux.Handle("GET /api/custom-statblocks", server.GetCustomStatblocks(statblocks))
	mux.Handle("POST /api/custom-statblocks", server.PostCustomStatblocks(statblocks))

	handler := server.LimitPostBody(mux)

	log.Println("listening on :8080")
	if err := http.ListenAndServe(":8080", handler); err != nil {
		log.Fatal(err)
	}
}
