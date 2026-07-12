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
	SchemaVersion int         `json:"schemaVersion"`
	ID            string      `json:"id"`
	UserID        string      `json:"userId"`
	Summary       Summary     `json:"summary"`
	Fields        Fields      `json:"fields"`
	CustomLists   CustomLists `json:"customLists"`
	UIState       UIState     `json:"uiState"`
	UpdatedAt     string      `json:"updatedAt"`
}

type Fields map[string]string

type CustomLists struct {
	Feats               []FeatureEntry       `json:"feats"`
	Weapons             []WeaponRow          `json:"weapons"`
	Spells              []SpellRow           `json:"spells"`
	Proficiencies       map[string][]string  `json:"proficiencies"`
	Defenses            map[string][]string  `json:"defenses"`
	JournalNotes        []JournalNote        `json:"journalNotes"`
	InventoryItems      []InventoryItem      `json:"inventoryItems"`
	InventoryEquipment  []InventoryItem      `json:"inventoryEquipment"`
	MagicItems          []InventoryItem      `json:"magicItems"`
	Consumables         []InventoryItem      `json:"consumables"`
	Gems                []GemItem            `json:"gems"`
	AttunementSlots     []AttunementSlot     `json:"attunementSlots"`
	StorageLocations    []StorageLocation    `json:"storageLocations"`
	EquippedSlots       map[string]string    `json:"equippedSlots"`
	CustomEquippedSlots []CustomEquippedSlot `json:"customEquippedSlots"`
	InventoryView       string               `json:"inventoryView"`
	Speeds              []SpeedRow           `json:"speeds"`
	ArmorClass          ArmorClassState      `json:"armorClass"`
}

type FeatureEntry struct {
	Name        string `json:"name"`
	Short       string `json:"short"`
	HasResource bool   `json:"hasResource"`
	Resource    string `json:"resource"`
	Details     string `json:"details"`
	Open        bool   `json:"open"`
	SourceID    string `json:"sourceId"`
	Source      string `json:"source"`
	Category    string `json:"category"`
}

type WeaponRow struct {
	Name   string `json:"name"`
	Atk    string `json:"atk"`
	Damage string `json:"damage"`
	Notes  string `json:"notes"`
}

type SpellRow struct {
	Level         string `json:"level"`
	Name          string `json:"name"`
	CastTime      string `json:"castTime"`
	Range         string `json:"range"`
	Concentration bool   `json:"concentration"`
	Ritual        bool   `json:"ritual"`
	Material      bool   `json:"material"`
	Effect        string `json:"effect"`
	Details       string `json:"details"`
	Open          bool   `json:"open"`
}

type JournalNote struct {
	ID       string `json:"id"`
	Category string `json:"category"`
	Title    string `json:"title"`
	Body     string `json:"body"`
	Open     bool   `json:"open"`
}

type InventoryItem struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Qty      string `json:"qty"`
	Value    string `json:"value"`
	Location string `json:"location"`
	Details  string `json:"details"`
	Open     bool   `json:"open"`
}

type GemItem struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Qty      string `json:"qty"`
	Value    string `json:"value"`
	Location string `json:"location"`
	Notes    string `json:"notes"`
}

type AttunementSlot struct {
	Item  string `json:"item"`
	Notes string `json:"notes"`
}

type StorageLocation struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Type  string `json:"type"`
	Notes string `json:"notes"`
}

type CustomEquippedSlot struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	ItemID string `json:"itemId"`
}

type SpeedRow struct {
	Type       string `json:"type"`
	CustomType string `json:"customType"`
	Value      string `json:"value"`
}

type ArmorClassState struct {
	Base      string               `json:"base"`
	Modifiers []ArmorClassModifier `json:"modifiers"`
}

type ArmorClassModifier struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Active bool   `json:"active"`
}

type UIState struct {
	Inspiration        bool   `json:"inspiration"`
	SkillProficiencies []bool `json:"skillProficiencies"`
	DeathSaves         []bool `json:"deathSaves"`
	Exhaustion         []bool `json:"exhaustion"`
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
	Name              string           `json:"name"`
	ArmorClass        string           `json:"armorClass"`
	HpCurrent         string           `json:"hpCurrent"`
	HpMax             string           `json:"hpMax"`
	TempHp            string           `json:"tempHp"`
	HitDice           string           `json:"hitDice"`
	PassivePerception string           `json:"passivePerception"`
	CurrentConditions string           `json:"currentConditions"`
	ArmorClassState   *ArmorClassState `json:"armorClassState"`
}
