# 04 · Exercises

Seeded users (module 02): `ada@`, `linus@`, `grace@`, `alan@example.com`, all with password `password`.

---

## 04.1 🟢 Login page

1. `lerd artisan make:controller Auth/LoginController --no-interaction`
2. `create` renders `auth/Login`, and `store` logs in, as in lesson §3.
3. Routes in a `guest` group; `GET /login` is named `login`.
4. `auth/Login.vue`: email, password, a "remember me" checkbox, and errors shown under email. Use `<Form>` and **don't** use `AppLayout` for this page.

**Done when** `ada@example.com` / `password` lands you on `/rooms`, and a wrong password shows the error under email with the email still filled in.

<details><summary>Hint 1: keeping the email after an error</summary>

`<Form>` doesn't clear inputs on error by default. If yours clears, look for `reset-on-error`.
</details>

<details><summary>Hint 2: checkbox value</summary>

An unchecked checkbox isn't sent at all. A checked one sends `"on"`. `$request->boolean('remember')` handles both.
</details>

---

## 04.2 🟢 Protect everything and log out

1. Wrap every chat route in an `auth` group.
2. Add `POST /logout` named `logout`.
3. In `AppLayout`'s header, show the user's name and a logout button: `<Link :href="logout()" as="button">`.
4. Fix the `Auth` type: `user: User | null`.

**Done when** visiting `/rooms/general` logged out → redirected to `/login` → after login you land **back on `/rooms/general`** (that's `intended()`), and logging out returns you to `/login`.

<details><summary>Hint</summary>

The Wayfinder import for a named route: `import { logout } from '@/routes'`. Check `resources/js/routes/index.ts` after Vite regenerates.
</details>

---

## 04.3 🟢 Kill the TEMP user

1. Search the project for `TEMP(module 04)`.
2. Replace each one with `$request->user()`.
3. Tighten the shared `auth.user` to `id, name, email`.

**Done when** the search finds nothing, and messages sent as Linus show "Linus" as the author.

---

## 04.4 🟢 RoomPolicy

1. `lerd artisan make:policy RoomPolicy --model=Room --no-interaction`
2. `view`: the user is a member.
3. `sendMessage`: the user is a member. (Separate method, same rule for now. Rules diverge later, e.g. read-only members.)
4. Enforce `view` in `RoomController@show` and `sendMessage` in `StoreMessageRequest::authorize()`.
5. The sidebar shows **only rooms the user belongs to**.

**Done when**, logged in as Grace (not a member of `dev`):
- `dev` isn't in her sidebar
- `/rooms/dev` → 403
- `curl`-style POST to `/rooms/dev/messages` → 403. Try it with the browser console:

```js
fetch('/rooms/dev/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)[1]) },
  body: JSON.stringify({ body: 'sneaky' }),
}).then(r => console.log(r.status))
```

<details><summary>Hint 1: membership check</summary>

`$room->members()->whereKey($user->id)->exists()` runs one cheap query. Don't use `$room->members->contains($user)`: it loads every member just to check one.
</details>

<details><summary>Hint 2: route in a Form Request</summary>

`$this->route('room')` returns the bound `Room` model.
</details>

---

## 04.5 🟡 MessagePolicy and `can` flags

1. `MessagePolicy`: `update` and `delete` only for the author. The **room owner** may also `delete`.
2. Enforce them in `MessageController@update` and `@destroy`.
3. Add `can: { update, delete }` to each message in `MessageResource`.
4. Replace the 03.6 UI-only check with `message.can.update` and `message.can.delete`.

**Done when** Ada (owner of all rooms) can delete Linus's messages but not edit them, Linus can edit and delete his own, and forged requests get a 403.

<details><summary>Hint: user inside a resource</summary>

`toArray(Request $request)` receives the request, so use `$request->user()->can('update', $this->resource)`.

Watch your query count: does the policy hit the database per message? For `delete`, comparing `$room->owner_id` needs the room, so eager load it or pass it in.
</details>

---

## 04.6 🟡 Join and leave rooms

1. A "Browse rooms" page lists **all** rooms, with a Join button on rooms you're not in.
2. `POST /rooms/{room:slug}/members` joins; `DELETE /rooms/{room:slug}/members` leaves.
3. The owner can't leave their own room (policy: `leave`).
4. The sidebar updates immediately after join/leave.

**Done when** Grace joins `dev`, sees it in her sidebar, can read it, and can leave again. Ada sees no Leave button on rooms she owns.

<details><summary>Hint: joining twice</summary>

`attach()` twice violates the composite primary key. `syncWithoutDetaching([$user->id])` is idempotent.
</details>

---

## 04.7 🟡 Throttle login

Lock out an email+IP pair after 5 failed attempts for 60 seconds. Show "Too many attempts. Try again in N seconds."

**Done when** the 6th wrong attempt shows the lockout message, and a correct login after the wait works.

<details><summary>Hint</summary>

Use the `RateLimiter` facade: `tooManyAttempts($key, 5)`, `hit($key, 60)`, `availableIn($key)`, `clear($key)`. A good key is `Str::lower($email).'|'.$request->ip()`. The `throttle` middleware is simpler, but it limits by route, not per email.
</details>

---

## 04.8 🔴 Register

Add registration: name, email (unique), password (confirmed, using `Password::defaults()`). Log the user in right after, and auto-join them to `general`.

**Done when** a new user can sign up, lands in `general`, and can send messages.

<details><summary>Hint</summary>

`Auth::login($user)` logs in a user instance you already have, and `regenerate()` the session afterwards. Look at `Password::defaults()` in the validation docs and set the rules in `AppServiceProvider`.
</details>

---

## Before Part B

Make sure you can, at the same time:
- be logged in as **Ada** in a normal window, and
- be logged in as **Linus** in a private window,
- both viewing `/rooms/general`.

Send a message as Ada. Linus doesn't see it until he refreshes. That's the problem Part B solves.
