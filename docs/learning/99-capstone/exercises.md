# 99 · Milestones

Each milestone lists **design questions** to answer in writing before you code, and **acceptance checks**. Open the design notes in [solutions.md](solutions.md) only after writing your own.

---

## M1 · Public and private rooms

**Build:** `visibility` on rooms; the browse page lists public rooms plus private rooms you're in; joining is allowed for public rooms only; owners can switch visibility.

**Design questions**
- What do `RoomPolicy::view` and `RoomPolicy::join` return for each combination of {public, private} × {member, non-member}?
- Can a non-member *read* a public room without joining? Decide, and make the channel rule agree with the page policy.
- If an owner makes a room private, what happens to current non-member viewers who are subscribed?

**Acceptance**
- [ ] Grace can't see the name of a private room she isn't in, anywhere (browse page, sidebar, search, notifications).
- [ ] Grace's `/broadcasting/auth` for that room: 403 (tested).
- [ ] Switching to private while Grace views it as a non-member: she's moved out live.

---

## M2 · Invitations

**Build:** owners invite users to private rooms; the invitee sees the invitation live (bell + badge), and can accept or decline; accepting adds the room to their sidebar in every tab.

**Design questions**
- Which channel delivers the invite? Which event or notification type?
- Notification or plain event? (Hint: does it need history?)
- What if the invitee is removed from the room's eligible list before accepting?

**Acceptance**
- [ ] Invite → invitee's bell updates live on any page.
- [ ] Accept in tab A → sidebar updates in tab B.
- [ ] Only owners can invite (policy + test); invitees can't accept someone else's invite (test).

---

## M3 · Unread counts

**Build:** each sidebar room shows an unread count; opening a room marks it read; counts update live when others post; counts are exact after reload.

**Design questions**
- Store `last_read_message_id` per membership, or count rows? How do you compute all sidebar counts in **one** query?
- Live: when Linus posts in `dev`, how does Ada's sidebar (on another page) learn about it, without one event per member per message? Compare: (a) per-member user-channel events (queued fan-out), (b) the sidebar subscribing to every room's channel, (c) one lightweight event + debounced partial reload.
- When does "read" happen: on page load? On scroll to bottom? On window focus?
- Multi-tab: reading in tab A clears tab B's badge. How?

**Acceptance**
- [ ] Sidebar unread counts with a fixed number of queries regardless of room count (prove it).
- [ ] Live increments on any page; exact after reload.
- [ ] Reading in one tab clears the badge in the others.
- [ ] Your own messages never count as unread.

---

## M4 · Direct messages

**Build:** start a DM with any user from their name; DMs appear in a separate sidebar section; same live messages, presence (online/typing) and unread behavior as rooms.

**Design questions**
- Room with `type = 'direct'` and two members, or a new `Conversation` model? What does each choice cost you in policies, channels, events and Vue components?
- How do you prevent two DM rooms between the same pair?
- DM channel names must not be guessable *and* authorized. Is authorization alone enough? (It is, but explain why.)

**Acceptance**
- [ ] Starting a DM twice opens the same conversation (database constraint or lookup, and tested).
- [ ] A third user can't subscribe to or read the DM (test).
- [ ] Mentions don't apply in DMs, but every DM message notifies the other person if they're not viewing it.

---

## M5 · Reliability pass

**Build:** go through every event and listener with the module 10–11 checklists.

**Acceptance**
- [ ] All write-path broadcasts are `ShouldBroadcast` + `ShouldDispatchAfterCommit`.
- [ ] Fan-out happens in jobs.
- [ ] Reconnect re-sync covers messages, sidebar (rooms, DMs, unread) and notifications.
- [ ] Out-of-order `updated`/`deleted` is handled.
- [ ] Simulated deploy (`reverb:restart` + `queue:restart` while two users chat): no lost or duplicated messages.

---

## M6 · Test suite and hardening

**Acceptance**
- [ ] Tests for every policy method (datasets), every channel rule (reverb driver), every event (shape + leak), and the "same shape" tests.
- [ ] `allowed_origins` from env; rate limiting decided and documented.
- [ ] `lerd artisan test --compact` is green; `vendor/bin/pint --dirty` is clean.
- [ ] A short `my-architecture.md` in your notes: channels, events, payloads and policies, one table each.

---

## Stretch ideas

- **Reactions** (👍 on messages) with optimistic toggling and conflict-free counts.
- **Threads:** replies to a message in a side panel, live.
- **Read receipts** in DMs ("seen"), using `last_read_message_id` from M3.
- **Message search** with Laravel Scout's database engine.
- **Attachments:** uploads with progress, broadcast once processing finishes.
- **Admin dashboard:** live connection counts via Pulse (13.7).
