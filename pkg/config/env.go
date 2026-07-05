package config

import (
	"os"

	"github.com/joho/godotenv"
)

var (
	StorageMode = os.Getenv("MYTHICAL_BLUE_STORAGE_MODE")
	UserSecret  = os.Getenv("USER_SECRET")
	S3Key       = os.Getenv("S3_KEY")
	S3Secret    = os.Getenv("S3_SECRET")
)

func StorageLocal() bool {
	return StorageMode == "local"
}

func Load() {
	_ = godotenv.Load()
	StorageMode = os.Getenv("MYTHICAL_BLUE_STORAGE_MODE")
	UserSecret = os.Getenv("USER_SECRET")
	S3Key = os.Getenv("S3_KEY")
	S3Secret = os.Getenv("S3_SECRET")
}
