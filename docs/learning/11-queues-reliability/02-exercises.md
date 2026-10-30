# 11 · Exercises

Keep a terminal tailing the worker: `journalctl --user -u lerd-queue-laravel-reverb-example -f`.

---

## 11.1 🟢 Queue the message events

1. Switch `MessagePosted`, `MessageUpdated` and `MessageDeleted` to `ShouldBroadcast`.
2. `lerd artisan queue:restart`.
3. Send a message and watch the worker log process `Illuminate\Broadcasting\BroadcastEvent`.

**Done when** live messages work exactly as before, and you've seen the job in the worker log.

---

## 11.2 🟢 Survive a Reverb outage

1. `lerd worker stop reverb`.
2. Send 3 messages as Ada. (Does the POST succeed? With `Now` it wouldn't have.)
3. Watch the worker log: what happens to the jobs?
4. Check `lerd artisan queue:failed`.
5. `lerd worker start reverb`, then `lerd artisan queue:retry all`.

**Done when** you can describe what happened at each step, and the retried broadcasts arrive.

<details><summary>Hint</summary>

With `--tries=3` and no backoff, the 3 attempts happen within seconds, probably before you restart Reverb. Add `#[Backoff([2, 10, 30])]` to the event (and `queue:restart`) to see retries outlast a short outage.
</details>

---

## 11.3 🟢 After-commit room creation

1. Wrap room creation (create + attach owner) in `DB::transaction`.
2. Inside it, dispatch a queued `RoomCreated` event to the owner's user channel (so other tabs refresh the sidebar).
3. Make the event `ShouldDispatchAfterCommit`.
4. Prove the rollback case: throw an exception at the end of the transaction closure. No broadcast must go out.

**Done when** creation broadcasts once on success, and **nothing** is broadcast (and no job is queued) when the transaction rolls back.

<details><summary>Hint: checking "no job queued"</summary>

Count `jobs` rows before and after, or watch the worker log. Without `ShouldDispatchAfterCommit`, does the job row survive the rollback with the database queue? Try both and compare.
</details>

---

## 11.4 🟡 Tolerate disorder

1. Simulate out-of-order delivery: in the `.message.posted` handler, wrap the update in `setTimeout(…, 2000)`.
2. Ada posts then quickly edits her message. What does Linus see?
3. Make the handlers tolerant: an `updated` for an unknown id is held briefly or triggers a reload, and messages are inserted in `id` order.

**Done when** with the artificial delay Linus still ends up with the edited text. Then remove the `setTimeout`.

---

## 11.5 🟡 A broadcasts-first queue

1. Put the three message events on queue `broadcasts` with `#[Queue('broadcasts')]`.
2. `queue:restart` and send a message. It doesn't arrive. Why? (Check the `jobs` table's `queue` column.)
3. Add and start the `queue-priority` worker from lesson §7.
4. Create a slow job (`sleep(10)` in `handle`) on `default`, dispatch 3 of them, then send a chat message.

**Done when** the chat message arrives immediately despite the slow jobs, and you can explain why (one worker, queue order `broadcasts,default`).

---

## 11.6 🟡 Fan-out job

Move the "tell every member" loops (room rename 09.2, activity 10.5) into a queued `NotifyRoomMembers` job. Seed a room with 300 members (factory) and compare the request time of a rename before and after.

**Done when** the rename request time no longer grows with member count, and every member still gets the event.

<details><summary>Hint: measuring</summary>

The Network tab's timing for the PATCH, or `lerd`'s route timing (`diag route_timing` via the lerd MCP), or wrap the controller body in `Benchmark::measure(fn () => …)` temporarily.
</details>

---

## 11.7 🔴 Rescue the typing whisper's server cousin

Some teams send "is typing" through the server (to rate-limit or log it). Build `POST /rooms/{room:slug}/typing` → `UserTyping` event (`ShouldBroadcastNow`, `ShouldRescue`, `toOthers()`), throttled by route middleware to 1 request per 3s per user. Stop Reverb and confirm the endpoint still returns 204 and logs the failure.

**Done when** typing works through the server with Reverb up, and with Reverb down the endpoint stays 204 while `laravel.log` records the exception. Then write two sentences comparing it with the whisper from module 08.
