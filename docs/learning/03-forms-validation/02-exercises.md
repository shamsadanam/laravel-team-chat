# 03 · Exercises

---

## 03.1 🟢 Post a message (inline validation)

1. `lerd artisan make:controller MessageController --no-interaction`
2. Route: `POST /rooms/{room:slug}/messages` → `MessageController@store`, named `rooms.messages.store`.
3. `store(Request $request, Room $room)`: validate `body` (required, string, max 2000), create the message with the `TEMP(module 04)` author from lesson §7, and `return back()`.
4. On `rooms/Show`, add a composer built with `useForm`: textarea + send button. Use `preserveScroll` and reset `body` on success.

**Done when** sending a message adds it to the bottom of the list without a page reload, and sending an empty message shows "The body field is required." under the textarea.

<details><summary>Hint 1</summary>

The Wayfinder import is `import { store } from '@/actions/App/Http/Controllers/MessageController'`, and the URL is `store.url(room.slug)`.
</details>

<details><summary>Hint 2</summary>

Your `show` loads "latest 50, reversed", so the new message appears at the bottom automatically. If it doesn't, check the `reverse()->values()` part from 02.4.
</details>

---

## 03.2 🟢 Move it to a Form Request

1. `lerd artisan make:request StoreMessageRequest --no-interaction`
2. Move the rules there. `authorize()` returns `true` for now.
3. Type-hint it in `store` and use `$request->validated('body')`.
4. Trim whitespace: a body of `"   "` should fail `required`.

**Done when** behavior is identical to 03.1 and a whitespace-only message is rejected.

<details><summary>Hint</summary>

Laravel's `TrimStrings` middleware already trims input globally, so `"   "` becomes `""`, which fails `required`. Check this before you write any code. Knowing what the framework already does is the skill here.
</details>

---

## 03.3 🟢 Send on Enter

In the composer:
- **Enter** sends.
- **Shift+Enter** inserts a newline.
- Disable the button while `processing` and while the body is empty.

**Done when** all three behave correctly, and holding Enter doesn't send duplicates.

<details><summary>Hint</summary>

`@keydown.enter.exact.prevent="send"`. The `.exact` modifier means "Enter with no modifiers", so Shift+Enter falls through to the default newline. In `send()`, return early if `form.processing`.
</details>

---

## 03.4 🟡 Create a room

1. `GET /rooms/create` → `RoomController@create` renders `rooms/Create`.
2. `POST /rooms` → `RoomController@store` with a `StoreRoomRequest`:
   - `name`: required, 2–40 characters
   - `description`: optional, max 200
   - `slug` derived from the name in `prepareForValidation`, and unique
3. The `TEMP(module 04)` user becomes the owner **and** the first member.
4. Redirect to the new room.
5. Use the `<Form>` component with `v-bind="store.form()"`.

**Done when** you can create "Design Team" → land on `/rooms/design-team` → see it in the sidebar. Creating "design team" again shows an error. Think about **which field** that error should appear under.

<details><summary>Hint 1: the error lands on `slug`, but there's no slug input</summary>

Customize the message and attach it where the user can see it. Either:
- show `errors.slug` under the name input, or
- set a custom message (`messages()` in the Form Request) like "A room with this name already exists."

Both are fine; choose one deliberately.
</details>

<details><summary>Hint 2: owner + member in one go</summary>

```php
$room = Room::create([...$request->validated(), 'owner_id' => $author->id]);
$room->members()->attach($author);
```

What happens if the second line fails? Module 11 comes back to this with transactions.
</details>

---

## 03.5 🟡 Flash a toast

1. After creating a room, flash `toast: { type: 'success', message: 'Room created' }`.
2. Show it in `AppLayout`, and hide it after 3 seconds.
3. Type it with `flashDataType` so `page.flash.toast` isn't `any`.

**Done when** the toast appears once after creation, disappears after 3s, and does **not** reappear when you press Back and Forward.

<details><summary>Hint</summary>

A `watch(() => page.flash.toast, …)` in the layout can copy the toast into a local `ref` and start a `setTimeout` that clears it. Clear the timer if a new toast arrives first.
</details>

---

## 03.6 🟡 Edit and delete your own message

1. `PATCH /rooms/{room:slug}/messages/{message}` and `DELETE …/{message}`.
2. Only the `TEMP` user's own messages show "edit" and "delete" buttons. (Real authorization comes in module 04. For now, a UI check only.)
3. Edit inline: clicking "edit" swaps the message for a small form.
4. Make sure the message belongs to the room in the URL.

**Done when** edit and delete work, and `PATCH /rooms/general/messages/{an id from dev}` returns 404.

<details><summary>Hint: scoped bindings</summary>

`Route::scopeBindings()` (or `->scopeBindings()` on the route) makes Laravel look the message up *through* the room: `$room->messages()->findOrFail($id)`. A message from another room 404s.
</details>

<details><summary>Hint: delete from Vue</summary>

`<Link :href="destroy({ room: room.slug, message: m.id })" as="button">Delete</Link>`. A Wayfinder object with method `delete` makes `<Link>` render a button.
</details>

---

## 03.7 🔴 Live validation with Precognition

Read the Precognition section of the Inertia forms docs. Make the "create room" form validate `name` **as you type** (on blur), reusing `StoreRoomRequest` with no duplicated rules in JS.

**Done when** typing an existing room's name and leaving the field shows the uniqueness error before you click Create.

<details><summary>Hint</summary>

Two parts. On the server, add the `HandlePrecognitiveRequests` middleware to the `store` route (see the Laravel Precognition docs). On the client, your `<Form>` already supports it: take `validate` and `invalid` from the slot props and call `validate('name')` on `@change`.
</details>

<details><summary>Hint: why doesn't the room get created during validation?</summary>

A precognitive request runs the Form Request's rules and then stops. The controller method never runs.
</details>
