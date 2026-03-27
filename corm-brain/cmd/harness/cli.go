package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/frontier-corm/corm-brain/internal/types"
)

// CLI provides an interactive command loop for sending events to the corm-brain.
type CLI struct {
	hub       *Hub
	renderer  *Renderer
	sessionID string
	playerAddr string
	playerCtx  string
	seq        atomic.Uint64
}

// NewCLI creates a new interactive CLI.
func NewCLI(hub *Hub, renderer *Renderer, sessionID, playerAddr, playerCtx string) *CLI {
	return &CLI{
		hub:        hub,
		renderer:   renderer,
		sessionID:  sessionID,
		playerAddr: playerAddr,
		playerCtx:  playerCtx,
	}
}

// Run starts the interactive command loop. Blocks until "quit" or ctx cancellation.
func (c *CLI) Run(ctx context.Context) {
	scanner := bufio.NewScanner(os.Stdin)
	c.printHelp()
	fmt.Print("\n> ")

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return
		default:
		}

		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			fmt.Print("> ")
			continue
		}

		parts := strings.Fields(line)
		cmd := parts[0]
		args := parts[1:]

		switch cmd {
		case "help", "h", "?":
			c.printHelp()
		case "click":
			c.sendClick(ctx, args)
		case "decrypt":
			c.sendDecrypt(ctx, args)
		case "submit":
			c.sendWordSubmit(ctx, args)
		case "transition":
			c.sendPhaseTransition(ctx, args)
		case "contract-complete":
			c.sendContractEvent(ctx, types.EventContractComplete)
		case "contract-failed":
			c.sendContractEvent(ctx, types.EventContractFailed)
		case "purge":
			c.sendSimple(ctx, types.EventPurge)
		case "status":
			c.printStatus()
		case "quit", "exit", "q":
			return
		default:
			fmt.Printf("unknown command: %s (type 'help' for commands)\n", cmd)
		}

		fmt.Print("\n> ")
	}
}

func (c *CLI) printHelp() {
	fmt.Println(`
Harness CLI — send events to corm-brain

Commands:
  click [element_id]                   Send a click event (Phase 0)
  decrypt <row> <col>                  Send a decrypt event (Phase 1)
  submit <word> <correct|incorrect>    Send a word_submit event
  transition <phase>                   Send a phase_transition event
  contract-complete                    Send a contract_complete event
  contract-failed                      Send a contract_failed event
  purge                                Send a purge event
  status                               Show connection state and config
  help                                 Show this help
  quit                                 Exit`)
}

func (c *CLI) makeEvent(eventType string, payload interface{}) types.CormEvent {
	seq := c.seq.Add(1)
	var raw json.RawMessage
	if payload != nil {
		raw, _ = json.Marshal(payload)
	}
	return types.CormEvent{
		Type:          "event",
		Seq:           seq,
		SessionID:     c.sessionID,
		PlayerAddress: c.playerAddr,
		Context:       c.playerCtx,
		EventType:     eventType,
		Payload:       raw,
		Timestamp:     time.Now(),
	}
}

func (c *CLI) send(ctx context.Context, evt types.CormEvent) {
	if err := c.hub.SendEvent(ctx, evt); err != nil {
		fmt.Printf("  error: %v\n", err)
	}
}

func (c *CLI) sendClick(ctx context.Context, args []string) {
	elementID := "button-1"
	if len(args) > 0 {
		elementID = args[0]
	}
	evt := c.makeEvent(types.EventClick, map[string]string{"element_id": elementID})
	c.send(ctx, evt)
}

func (c *CLI) sendDecrypt(ctx context.Context, args []string) {
	if len(args) < 2 {
		fmt.Println("  usage: decrypt <row> <col>")
		return
	}
	row, err1 := strconv.Atoi(args[0])
	col, err2 := strconv.Atoi(args[1])
	if err1 != nil || err2 != nil {
		fmt.Println("  row and col must be integers")
		return
	}
	evt := c.makeEvent(types.EventDecrypt, map[string]int{"row": row, "col": col})
	c.send(ctx, evt)
}

func (c *CLI) sendWordSubmit(ctx context.Context, args []string) {
	if len(args) < 2 {
		fmt.Println("  usage: submit <word> <correct|incorrect>")
		return
	}
	word := args[0]
	correct := args[1] == "correct"
	evt := c.makeEvent(types.EventWordSubmit, map[string]interface{}{
		"word":    word,
		"correct": correct,
	})
	c.send(ctx, evt)
}

func (c *CLI) sendPhaseTransition(ctx context.Context, args []string) {
	newPhase := 1
	if len(args) > 0 {
		if p, err := strconv.Atoi(args[0]); err == nil {
			newPhase = p
		}
	}
	evt := c.makeEvent(types.EventPhaseTransition, map[string]int{"new_phase": newPhase})
	c.send(ctx, evt)
}

func (c *CLI) sendContractEvent(ctx context.Context, eventType string) {
	evt := c.makeEvent(eventType, map[string]string{
		"contract_id":   "test-contract-1",
		"contract_type": "transport",
	})
	c.send(ctx, evt)
}

func (c *CLI) sendSimple(ctx context.Context, eventType string) {
	evt := c.makeEvent(eventType, nil)
	c.send(ctx, evt)
}

func (c *CLI) printStatus() {
	connected := "disconnected"
	if c.hub.IsConnected() {
		connected = "connected"
	}
	fmt.Printf("  corm-brain: %s\n", connected)
	fmt.Printf("  session:    %s\n", c.sessionID)
	fmt.Printf("  player:     %s\n", c.playerAddr)
	fmt.Printf("  context:    %s\n", c.playerCtx)
	fmt.Printf("  next seq:   %d\n", c.seq.Load()+1)
}
