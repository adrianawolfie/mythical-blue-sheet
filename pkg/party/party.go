package party

import "errors"

var (
	ErrInventoryConflict = errors.New("party inventory has changed since it was loaded")
	ErrInvalidCampaignID = errors.New("campaign ID is invalid")
)

// Inventory is the shared stash of one campaign's party: coins in the party
// purse, containers (a bag of holding, a cart, a ship's hold), and items that
// belong to the party as a whole or are loot waiting to be claimed.
type Inventory struct {
	CampaignID        string      `json:"campaignId"`
	Coins             Coins       `json:"coins"`
	Containers        []Container `json:"containers"`
	Items             []Item      `json:"items"`
	UpdatedAt         string      `json:"updatedAt"`
	ExpectedUpdatedAt string      `json:"expectedUpdatedAt,omitempty"`
}

type Coins struct {
	CP string `json:"cp"`
	SP string `json:"sp"`
	EP string `json:"ep"`
	GP string `json:"gp"`
	PP string `json:"pp"`
}

type Container struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CarriedBy string `json:"carriedBy"`
	Notes     string `json:"notes"`
}

// Item category is "party" for shared party gear or "loot" for treasure that
// is still to be divided. Loot with an empty ClaimedBy is unclaimed.
type Item struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Category  string `json:"category"`
	Type      string `json:"type"`
	Rarity    string `json:"rarity"`
	Qty       string `json:"qty"`
	Value     string `json:"value"`
	Container string `json:"container"`
	ClaimedBy string `json:"claimedBy"`
	Notes     string `json:"notes"`
}
