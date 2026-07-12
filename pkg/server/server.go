package server

import "raperonzolo/character-sheet/pkg/user"

type Server struct {
	users user.Repository
}

type Option func(*Server)

func WithUsers(u user.Repository) Option {
	return func(s *Server) {
		s.users = u
	}
}

func NewServer(options ...Option) Server {
	s := Server{}
	for _, option := range options {
		option(&s)
	}
	return s
}
