package character

type Index struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	ArmorClass        string `json:"armorClass"`
	HpCurrent         string `json:"hpCurrent"`
	HpMax             string `json:"hpMax"`
	PassivePerception string `json:"passivePerception"`
	CurrentConditions string `json:"currentConditions"`
	File              string `json:"file"`
	UpdatedAt         string `json:"updatedAt"`
}

type Character struct {
	SchemaVersion int            `json:"schemaVersion"`
	ID            string         `json:"id"`
	Summary       Summary        `json:"summary"`
	Fields        map[string]any `json:"fields"`
	CustomLists   map[string]any `json:"customLists"`
	UIState       map[string]any `json:"uiState"`
	UpdatedAt     string         `json:"updatedAt"`
}

type Summary struct {
	Name              string `json:"name"`
	ArmorClass        string `json:"armorClass"`
	HpCurrent         string `json:"hpCurrent"`
	HpMax             string `json:"hpMax"`
	TempHp            string `json:"tempHp"`
	HitDice           string `json:"hitDice"`
	PassivePerception string `json:"passivePerception"`
	CurrentConditions string `json:"currentConditions"`
}

type Update struct {
	Name              string         `json:"name"`
	ArmorClass        string         `json:"armorClass"`
	HpCurrent         string         `json:"hpCurrent"`
	HpMax             string         `json:"hpMax"`
	TempHp            string         `json:"tempHp"`
	HitDice           string         `json:"hitDice"`
	PassivePerception string         `json:"passivePerception"`
	CurrentConditions string         `json:"currentConditions"`
	ArmorClassState   map[string]any `json:"armorClassState"`
}
