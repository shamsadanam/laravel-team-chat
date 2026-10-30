# 10 · Checkpoint

1. Give one example where you'd push data and one where you'd push a signal and reload. Justify each.
2. Why should props you partially reload be closures on the server?
3. What's wrong with "local copy of `messages` + `watch` that replaces it"?
4. Why use `replaceProp` with a callback instead of `appendToProp` for live messages?
5. Describe what Inertia does on an optimistic update's success, and on its failure.
6. What can an optimistic rollback lose, and why is that acceptable for chat?
7. Reverb restarts for 20 seconds during a deploy. What does a connected client miss, and how does your app recover?
8. Where do you put the user-channel listener, and why there?
9. When is polling the right answer?

<details><summary>Answers</summary>

1. Push data: new chat messages (frequent, small, same for everyone). Signal + reload: the sidebar after membership changes, or anything per-viewer or aggregated, where the server renders the right thing for each viewer.
2. A closure only runs when its prop is requested. Plain values are computed on every request even when `only` excludes them.
3. Two sources of truth. The `watch` can overwrite live additions with a server snapshot taken a moment earlier, so messages flicker or vanish.
4. `appendToProp` always adds exactly one item; it can't skip duplicates. `replaceProp` returns the whole new array, so it can dedupe.
5. Success: the server's response props replace the optimistic ones. Failure: the snapshotted keys revert to their pre-optimistic values.
6. Live updates applied to the same prop during the in-flight request can be reverted with the snapshot. Rollbacks are rare, and the next reload restores them.
7. Every event broadcast during the gap. On reconnect, a `useConnectionStatus` watcher reloads the volatile props (`messages`, `rooms`, `notifications`).
8. In a logged-in-only child component of the persistent layout: one subscription for the whole session, active on every page.
9. When WebSockets can't connect (status `failed`, e.g. a proxy blocks them). Also for data that changes slowly enough that a few seconds' delay doesn't matter.
</details>
