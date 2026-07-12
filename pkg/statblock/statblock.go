package statblock

type Statblock struct {
	ID                     string   `json:"id"`
	Name                   string   `json:"name"`
	Section                string   `json:"section"`
	Size                   string   `json:"size"`
	Type                   string   `json:"type"`
	Alignment              string   `json:"alignment"`
	ArmorClass             string   `json:"armorClass"`
	Initiative             string   `json:"initiative"`
	HP                     string   `json:"hp"`
	HPFormula              string   `json:"hpFormula"`
	Speed                  string   `json:"speed"`
	ChallengeRating        string   `json:"challengeRating"`
	ProficiencyBonus       string   `json:"proficiencyBonus"`
	Description            string   `json:"description"`
	Text                   string   `json:"text"`
	Source                 string   `json:"source"`
	LegendaryResistanceMax int      `json:"legendaryResistanceMax"`
	LegendaryActionMax     int      `json:"legendaryActionMax"`
	SaveProficiencies      []string `json:"saveProficiencies"`
	SkillProficiencies     []string `json:"skillProficiencies"`
	SkillExpertise         []string `json:"skillExpertise"`
}
