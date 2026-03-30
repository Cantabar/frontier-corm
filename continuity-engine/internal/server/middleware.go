package server

import (
	"context"
	"net/http"
	"strings"

	"github.com/frontier-corm/continuity-engine/internal/puzzle"
)

// SessionMiddleware looks up or creates a session based on cookie.
//
// The cookie uses SameSite=None + Secure so it persists inside cross-origin
// iframes (the continuity-engine is embedded from api.ef-corm.com inside the
// SPA at ef-corm.com). When secureCookies is false (local HTTP dev), it falls
// back to SameSite=Lax without the Secure flag.
func SessionMiddleware(store *puzzle.SessionStore, secureCookies bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var sess *puzzle.Session

			// Check for existing session cookie
			cookie, err := r.Cookie("puzzle_session")
			if err == nil {
				sess = store.Get(cookie.Value)
			}

			// Create new session if needed
			if sess == nil {
				playerAddr := r.URL.Query().Get("player")
				ctx := "browser"

				// Extract SSU entity ID from path if present
				if entityID := extractEntityID(r.URL.Path); entityID != "" {
					ctx = "ssu:" + entityID
				}

				sess = puzzle.NewSession(playerAddr, ctx)
				store.Put(sess)

				c := &http.Cookie{
					Name:     "puzzle_session",
					Value:    sess.ID,
					Path:     "/",
					HttpOnly: true,
					MaxAge:   86400, // 24 hours
				}
				if secureCookies {
					// Cross-origin iframe: browser requires SameSite=None + Secure
					c.SameSite = http.SameSiteNoneMode
					c.Secure = true
				} else {
					c.SameSite = http.SameSiteLaxMode
				}
				http.SetCookie(w, c)
			}

			ctx := context.WithValue(r.Context(), puzzle.SessionContextKey, sess)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// extractEntityID pulls the entity_id from /ssu/:entity_id/... paths.
func extractEntityID(path string) string {
	parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
	if len(parts) >= 2 && parts[0] == "ssu" {
		return parts[1]
	}
	return ""
}

// CORSMiddleware adds permissive CORS headers for development.
func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
