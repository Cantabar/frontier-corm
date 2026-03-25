package reasoning

// Boost decision logic will live here.
// Currently, boost evaluation is called from phase1.go but the
// actual implementation is deferred until the puzzle-service grid
// protocol is finalized.
//
// The boost system will:
// - Track player decrypt patterns (which cells they click)
// - Identify cells near the hidden archive word
// - Send BoostPayload with cell references and effect type
// - Respect boost cooldowns and corruption-based suppression
