package users

import "errors"

var (
	ErrUserEmailRequired = errors.New("user email required")
	ErrUserAlreadyExists = errors.New("user already exists")
	ErrUserNotFound      = errors.New("user not found")
	ErrUserLimitReached  = errors.New("user limit reached")
	ErrPasswordInvalid   = errors.New("invalid password")
)
