# 99 · Final self-assessment

Explain each of these out loud, or in writing, without notes. Each one points to the module that teaches it. If you can't explain one, go back there.

## Laravel

- [ ] The request lifecycle and where middleware, routes and controllers fit. (01)
- [ ] Inertia's first visit vs subsequent visits, and the page object. (01)
- [ ] Migrations, relationships, eager loading, and preventing N+1. (02)
- [ ] API Resources as the single shape for page *and* socket. (02, 06)
- [ ] Post/Redirect/Get, Form Requests, and how validation errors reach Vue. (03)
- [ ] Session authentication, `regenerate()`, and policies in four places. (04)

## Realtime

- [ ] The full path of an event, naming every process and protocol. (05)
- [ ] The three groups of Reverb variables and who reads each. (05, 13)
- [ ] Public vs private vs presence channels, and how a private signature works. (06–08)
- [ ] `toOthers()`, `X-Socket-ID`, and the Inertia v3 interceptor. (06)
- [ ] Why broadcast payloads must be viewer-independent. (06)
- [ ] Why authorization happens only at subscribe time, and what to do about it. (07)
- [ ] Whispers: how they travel, and what they must never carry. (08)
- [ ] Model broadcasting vs explicit events vs notifications. (09)
- [ ] Push data vs push signal; prop helpers; optimistic updates and rollback. (10)
- [ ] Re-syncing after reconnects and deploys. (10, 13)
- [ ] Queued broadcasts, after-commit, ordering, missing models, fan-out. (11)
- [ ] Testing dispatch, shape, leaks and channel auth, and the null-driver trap. (12)
- [ ] Production topology, capacity ceilings, scaling with Redis, security settings. (13)

## Design drill

Pick one and design it fully on paper (data, policies, channels, events and payloads, client listeners, failure modes, tests), then build it:

1. **Live polls** in a room: create, vote once, results update live, close.
2. **Collaborative to-do list** per room: add, check and reorder, with concurrent edits.
3. **Support desk:** customers chat with whichever agent is available; agents see a live queue.
4. **Live auction:** countdown, bids that must be strictly increasing, the winner at close.

If you can do two of these without opening the lessons, you've got it.
