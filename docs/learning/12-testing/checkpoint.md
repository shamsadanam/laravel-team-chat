# 12 · Checkpoint

1. Name the four layers of a realtime feature, and the test tool for each.
2. What part of the realtime path can't PHP tests cover? How do you cover it?
3. Why `Event::fake([MessagePosted::class])` instead of `Event::fake()`?
4. How do you prove in a test that `toOthers()` was used?
5. Your test "non-member gets 403 on `/broadcasting/auth`" fails with 200. Why? Give both fixes.
6. Why must you `require routes/channels.php` again after switching the driver?
7. What is a leak test, and which events need one?
8. What does the "same shape" test protect?

<details><summary>Answers</summary>

1. HTTP action (feature test); dispatch (`Event::fake` + `assertDispatched`); event shape (call `broadcastOn`/`As`/`With` directly); channel auth (POST `/broadcasting/auth` with a real driver, or the channel class).
2. Reverb delivering frames, and Vue reacting. Cover it with a short manual two-browser checklist, or browser tests.
3. Faking everything also fakes Eloquent model events that factories, observers and model broadcasting depend on. Fake only what you assert.
4. Send the request with an `X-Socket-ID` header and assert `$event->socket` equals it. `toOthers()` copies the header into the event.
5. Tests run with `BROADCAST_CONNECTION=null`, whose `auth()` approves everything. Fix A: switch to the `reverb` driver and re-register channels. Fix B: test the channel class's `join()` directly.
6. The rules were registered on the broadcaster that existed at boot (null). A new driver instance starts with no channel rules.
7. An assertion that sensitive fields (email, tokens) don't appear in `json_encode($event->broadcastWith())`. Every event whose payload includes a user or other sensitive model.
8. That the Inertia page props and the broadcast payload use the same `MessageResource` shape, so the Vue code that renders both can't silently break on one path.
</details>
