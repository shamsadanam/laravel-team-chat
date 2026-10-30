# 04 · Checkpoint

1. A logged-in user opens a room they're not a member of. Which status code should they get: 401, 403 or 404? Why not the others?
2. Describe how `$request->user()` knows who you are on the request after login. Name the cookie, the middleware and the table involved.
3. What attack does `$request->session()->regenerate()` after login prevent?
4. Why does a failed login put the error on `email` and not say "wrong password"?
5. How does Laravel find `RoomPolicy` for `Room` without registration?
6. Name four places you can check a policy.
7. You hide the Delete button with `v-if="message.can.delete"`. Is the message now protected? Explain.
8. `$room->members->contains($user)` vs `$room->members()->whereKey($user->id)->exists()`: which belongs in a policy and why?
9. In module 07, Echo will POST to `/broadcasting/auth` to join a private channel. Why will your login "just work" there with no tokens?

<details><summary>Answers</summary>

1. **403**: we know who they are (so not 401), and they aren't allowed. **404** is a valid choice when you don't want to reveal that the room exists at all, which is common for private resources. Choose deliberately.
2. The encrypted `laravel_session` cookie is sent automatically → the `StartSession` middleware loads that session from the `sessions` table → the auth guard reads the stored user id → loads the `User`.
3. Session fixation: an attacker who planted or knew the pre-login session id would otherwise share your logged-in session.
4. So attackers can't use the login form to find out which emails have accounts.
5. Convention: `App\Models\Room` → `App\Policies\RoomPolicy`.
6. `Gate::authorize()` in a controller, `$user->can()`, route `->can('view', 'room')` middleware, a Form Request's `authorize()`. Also `@can` in Blade.
7. No. Hiding the button is UX. The `Gate::authorize('delete', $message)` in the controller is what protects it. Anyone can send the request by hand.
8. `whereKey()->exists()`: one tiny query. `->members->contains()` loads every member into memory to check one.
9. `/broadcasting/auth` is registered in the `web` middleware group, so the browser sends the same session cookie and `$request->user()` resolves exactly as on your pages.
</details>

---

**Part A complete.** You have a working, multi-user, server-rendered chat with real auth. Its one missing feature is the reason Reverb exists: other people's screens don't update. Part B starts there.
