# 08 · Checkpoint

1. What must a presence channel's callback return, and where does that data end up?
2. Does one `Broadcast::channel('rooms.{room}', …)` rule serve private and presence subscriptions? What must it return to serve both?
3. What does `here` give you, and who is missing from it?
4. Linus opens two tabs. How many `joining` events does Ada get?
5. Walk the path of a whisper. Does Laravel see it?
6. Name two things you must never send as whispers, and why.
7. Why throttle typing whispers on the sender *and* expire them on the receiver?
8. Grace's laptop goes to sleep. When does she disappear from the "Here now" list, and why not instantly?

<details><summary>Answers</summary>

1. An array of user info (or `false`/`null` to deny). It becomes `user_info`, sent to every member in `here`/`joining`/`leaving`.
2. Yes, because the prefix is stripped before matching. Return an array when allowed (truthy for private, user info for presence) and `false` otherwise.
3. The current members at the moment you joined, **excluding yourself**.
4. One. Members are keyed by user id; the second tab doesn't create a new member.
5. Browser → `client-…` frame → Reverb checks the sender is subscribed (`members` mode) → relays to other subscribers. Laravel never sees it.
6. Messages, votes, edits: anything that changes state or must be validated, persisted or authorized. Whispers skip Laravel completely, and their payload (including the claimed sender) is unverified.
7. Throttling keeps traffic down (keystrokes × members). Expiry handles senders who stop typing or close the tab, since no "stopped typing" signal is guaranteed.
8. After Reverb notices the dead connection: ping/activity timeout, ~30–60s with your config. TCP doesn't announce a sleeping laptop; the server only finds out when pings go unanswered.
</details>
