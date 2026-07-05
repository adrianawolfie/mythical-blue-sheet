package users

import "testing"

func TestUserValidatePassword(t *testing.T) {
	t.Setenv("USERS_SECRET", "secret")

	user := User{Password: encryptPassword("passwordsecret")}

	if !user.ValidatePassword("password") {
		t.Fatal("expected password to validate")
	}

	if user.ValidatePassword("wrong") {
		t.Fatal("expected wrong password to fail validation")
	}
}
