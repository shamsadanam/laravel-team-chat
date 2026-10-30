# 12 · Exercises

Create tests with `lerd artisan make:test --pest <Name> --no-interaction` and run them with `lerd artisan test --compact <path>`. You'll need factories for `Room` and `Message` (module 02).

---

## 12.1 🟢 Sending a message

`MessageSendingTest`:
1. A member can post; the message is saved; the response redirects.
2. Empty body → validation error on `body`, nothing saved.
3. A non-member gets 403, nothing saved.
4. A guest is redirected to login.

**Done when** all four pass, and each fails if you break the corresponding code (try it: remove the `authorize()` check and watch test 3 fail).

---

## 12.2 🟢 Broadcast dispatch

`MessageBroadcastingTest`:
1. Posting dispatches `MessagePosted` with the right message.
2. It was sent with `toOthers()` (the socket id from the `X-Socket-ID` header).
3. Editing dispatches `MessageUpdated`; deleting dispatches `MessageDeleted` with the right ids.
4. A **failed validation** dispatches nothing.

**Done when** all pass with `Event::fake([...])` listing only the message events.

---

## 12.3 🟢 Event shape and leak tests

For `MessagePosted`, `MessageUpdated`, `MessageDeleted` and `RoomMembershipChanged`, assert channel name, `broadcastAs()` and payload keys. For every event that includes a user, assert the email isn't in `json_encode($event->broadcastWith())`.

**Done when** all pass, and temporarily removing `broadcastWith()` from `MessagePosted` makes the leak test fail.

---

## 12.4 🟢 Channel authorization (the trap)

1. Write "non-member can't join a room's presence channel" **without** switching the driver. Watch it fail (200).
2. Add `useReverbBroadcasting()` (lesson §5) to `tests/Pest.php` as a helper function and use it.
3. Cover: member → 200 (and the response has `channel_data` with exactly `id` and `name`); non-member → 403; guest → 403; non-existent room → 403; user channel of another user → 403.

**Done when** all five pass with the reverb driver.

<details><summary>Hint: checking channel_data</summary>

```php
$data = json_decode($response->json('channel_data'), true);
expect($data['user_info'])->toBe(['id' => $ada->id, 'name' => $ada->name]);
```
</details>

---

## 12.5 🟡 Mentions

1. Mentioning a member notifies them, with the expected `toArray` data.
2. Mentioning a non-member (Grace in `dev`) sends nothing.
3. Mentioning yourself sends nothing.
4. Mentioning the same person twice sends one notification.

**Done when** all four pass with `Notification::fake()`.

---

## 12.6 🟡 Same shape, two paths

Write one test that loads `rooms/Show` and takes the first message from the Inertia props, then builds `MessagePosted` for **the same message** and compares `broadcastWith()['message']` with it.

**Done when** the test proves the page and the socket deliver identical message objects. Then change `MessageResource` and see both paths follow.

<details><summary>Hint</summary>

`$response->inertiaProps('messages.0')` (or `$response->viewData('page')['props']…`) gives you the prop array. Compare with `toEqual`.
</details>

---

## 12.7 🔴 After-commit, proven

Test that `RoomCreated` is **not** dispatched when the room-creation transaction rolls back, and **is** dispatched once when it commits.

**Done when** both tests pass and fail appropriately if you remove `ShouldDispatchAfterCommit`.

<details><summary>Hint</summary>

`Event::fake()` respects after-commit dispatching. To force a rollback, make the transaction throw: for example a unique-slug collision inside the closure, or a deliberately failing step you can toggle from the test.
</details>
