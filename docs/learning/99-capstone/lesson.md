# 99 · Capstone: finish the team chat

**Goal:** turn everything into one finished product, with less hand-holding. The lesson here is a **spec**; the exercises are **milestones**; the solutions are **design notes**, not code. You decide the implementation.

---

## The product

A team chat where:

1. Users log in, see the rooms they belong to, and browse and join public rooms.
2. Rooms are **public** (anyone can join) or **private** (invite only, by the owner).
3. Messages appear live for everyone in the room, can be edited and deleted, and support @mentions.
4. Each room shows who's here and who's typing.
5. The sidebar shows an **unread count** per room, live, and correct after reloads.
6. **Direct messages** between two users, with the same live behavior as rooms.
7. A notification bell for mentions and DMs while you're elsewhere.
8. It survives disconnects, deploys and multiple tabs without losing or duplicating messages.
9. It's tested: every policy, channel rule, event shape and leak.

## What's new compared with modules 01–13

| Feature | New problem it poses |
| --- | --- |
| Public vs private rooms | Two authorization rules for "view" and "join"; browsing must not leak private room names |
| Invitations | An owner acts on behalf of another user's membership; that user must be told live |
| Unread counts | Per-user state ("last read message id per room") that changes on *other people's* actions, and must be both live and exact |
| Direct messages | A "room" with exactly two members and no name. Model it as a room type, or a separate model? |
| Multi-tab | Reading in tab A should clear the unread badge in tab B |

## Suggested data model additions

```
rooms        + visibility ('public' | 'private'), + type ('channel' | 'direct')
room_user    + last_read_message_id (nullable), + last_seen_at (08.6)
invitations  (room_id, user_id, invited_by, accepted_at)   — optional; you may invite directly
```

These are suggestions. If you design something else, write down why in your notes.

## Non-functional requirements

- **No N+1 queries** on any page (keep `preventLazyLoading` on). Check the sidebar with unread counts especially.
- **No per-viewer data in broadcasts** (module 06 §5).
- **No private data on public channels.** Every room and DM channel is presence or private.
- **Reconnect-safe:** module 10's re-sync covers every volatile prop you add.
- **Queued, after-commit broadcasts** for everything that writes (module 11).
- **Tests** for every policy and channel rule, leak tests for every event, and the "same shape" test for every resource that is both rendered and broadcast (module 12).

## Rules for yourself

1. **Design before code.** Each milestone starts with a short design note: data, routes, channels, events (name, channel, payload), policies. Check it against the "design questions" in the milestone before you build.
2. **Commit per milestone**, with tests passing: `lerd artisan test --compact`.
3. **Two-browser check** at the end of every milestone (Ada + Linus, plus Grace for authorization).

Next: [milestones](exercises.md).
