package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"raperonzolo/character-sheet/pkg/party"
	"raperonzolo/character-sheet/pkg/storage"
)

func newPartyTestRepository(t *testing.T) party.Repository {
	t.Helper()

	s, err := storage.New(t.TempDir())
	if err != nil {
		t.Fatalf("new storage: %v", err)
	}
	repo, err := party.NewRepository(context.Background(), s)
	if err != nil {
		t.Fatalf("new party repository: %v", err)
	}
	return repo
}

func TestGetPartyInventoryRejectsMissingCampaign(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/party-inventory", nil)
	w := httptest.NewRecorder()

	GetPartyInventory(newPartyTestRepository(t)).ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", w.Code)
	}
}

func TestPostPartyInventorySavesAndDetectsConflicts(t *testing.T) {
	repo := newPartyTestRepository(t)
	post := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/party-inventory", strings.NewReader(body))
		w := httptest.NewRecorder()
		PostPartyInventory(repo).ServeHTTP(w, req)
		return w
	}

	w := post(`{"campaignId":"campaign-1","items":[{"name":"Potion of Healing","category":"loot","qty":"2"}]}`)
	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}
	var saved party.Inventory
	if err := json.NewDecoder(w.Body).Decode(&saved); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if saved.UpdatedAt == "" || len(saved.Items) != 1 || saved.Items[0].ID == "" {
		t.Fatalf("expected saved inventory, got %#v", saved)
	}

	if w := post(`{"campaignId":"campaign-1","items":[],"expectedUpdatedAt":"2000-01-01T00:00:00Z"}`); w.Code != http.StatusConflict {
		t.Fatalf("expected status 409, got %d", w.Code)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/party-inventory?campaignId=campaign-1", nil)
	got := httptest.NewRecorder()
	GetPartyInventory(repo).ServeHTTP(got, req)
	var loaded party.Inventory
	if err := json.NewDecoder(got.Body).Decode(&loaded); err != nil {
		t.Fatalf("decode inventory: %v", err)
	}
	if len(loaded.Items) != 1 || loaded.Items[0].Name != "Potion of Healing" {
		t.Fatalf("expected stored inventory, got %#v", loaded)
	}
}
