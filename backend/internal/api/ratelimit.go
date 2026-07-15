package api

import (
	"net"
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

const (
	// Entries idle longer than this are evicted.
	limiterIdleTTL = 3 * time.Minute
	// How often the eviction sweep may run (piggybacked on requests).
	limiterSweepEvery = time.Minute
)

// rateLimiter keeps one token bucket per client IP.
type rateLimiter struct {
	mu        sync.Mutex
	clients   map[string]*clientLimiter
	rps       rate.Limit
	burst     int
	lastSweep time.Time
}

type clientLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newRateLimiter(rps float64, burst int) *rateLimiter {
	return &rateLimiter{
		clients: make(map[string]*clientLimiter),
		rps:     rate.Limit(rps),
		burst:   burst,
	}
}

// allow reports whether a request from ip may proceed now.
func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	if now.Sub(rl.lastSweep) > limiterSweepEvery {
		rl.lastSweep = now
		for k, c := range rl.clients {
			if now.Sub(c.lastSeen) > limiterIdleTTL {
				delete(rl.clients, k)
			}
		}
	}

	c, ok := rl.clients[ip]
	if !ok {
		c = &clientLimiter{limiter: rate.NewLimiter(rl.rps, rl.burst)}
		rl.clients[ip] = c
	}
	c.lastSeen = now
	return c.limiter.Allow()
}

// withRateLimit rejects clients that exceed their per-IP budget with 429.
// /healthz stays exempt so liveness probes never get throttled. A nil
// limiter disables limiting entirely.
func withRateLimit(rl *rateLimiter, next http.Handler) http.Handler {
	if rl == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}
		ip, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			ip = r.RemoteAddr
		}
		if !rl.allow(ip) {
			writeError(w, http.StatusTooManyRequests, "rate_limited", "too many requests, slow down")
			return
		}
		next.ServeHTTP(w, r)
	})
}
