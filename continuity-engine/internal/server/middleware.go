package server

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/frontier-corm/continuity-engine/internal/puzzle"
)

// SessionSyncFn is called on new session creation when a network node is
// bound. It resolves the existing corm from the DB and initializes the
// session's phase/stability/corruption from stored traits, so the player
// lands on the correct phase immediately instead of always starting at
// Phase 0.
type SessionSyncFn func(ctx context.Context, sess *puzzle.Session, nodeID string)

// SessionMiddleware looks up or creates a session based on cookie.
//
// The cookie uses SameSite=None + Secure so it persists inside cross-origin
// iframes (the continuity-engine is embedded from api.ef-corm.com inside the
// SPA at ef-corm.com). When secureCookies is false (local HTTP dev), it falls
// back to SameSite=Lax without the Secure flag.
//
// syncFn is optional — if non-nil it is called after session creation when a
// network node is bound, to eagerly restore corm state from the database.
func SessionMiddleware(store *puzzle.SessionStore, secureCookies bool, syncFn SessionSyncFn) func(http.Handler) http.Handler {
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

				// Auto-bind network node from URL param (set by the web
				// app when the player has an installed corm). This makes
				// the Phase 2 manual bind form unnecessary.
				nodeID := r.URL.Query().Get("node")
				if nodeID != "" && sess.GetNetworkNodeID() == "" {
					sess.SetNetworkNodeID(nodeID)
				}

				// Player identity for contract access restriction.
				if charID := r.URL.Query().Get("characterId"); charID != "" {
					sess.SetPlayerCharacterID(charID)
				}
				if tribeStr := r.URL.Query().Get("tribeId"); tribeStr != "" {
					if tID, err := strconv.ParseUint(tribeStr, 10, 32); err == nil && tID > 0 {
						sess.SetPlayerTribeID(uint32(tID))
					}
				}

				// Eagerly sync corm state from DB when a node is bound,
				// so the session starts at the correct phase.
				if syncFn != nil && nodeID != "" {
					syncFn(r.Context(), sess, nodeID)
				}

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
