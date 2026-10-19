# 02 · Exercises

Run every Artisan command as `lerd artisan …`. Commit after each exercise.

---

## 02.1 🟢 Tables

Create the three tables from the lesson: `rooms`, `room_user`, `messages`.

1. `lerd artisan make:model Room -mfs --no-interaction`
2. `lerd artisan make:model Message -mf --no-interaction`
3. `lerd artisan make:migration create_room_user_table --no-interaction`
4. Fill in each migration. Include the foreign keys, the unique `slug`, the composite primary key on `room_user`, and the `(room_id, created_at)` index on `messages`.
5. `lerd artisan migrate`

**Done when** `lerd artisan migrate:status` shows all three as Ran, and `lerd artisan db:table messages` lists the index.

<details><summary>Hint 1: composite primary key</summary>

```php
$table->foreignId('room_id')->constrained()->cascadeOnDelete();
$table->foreignId('user_id')->constrained()->cascadeOnDelete();
$table->primary(['room_id', 'user_id']);
```
</details>

<details><summary>Hint 2: migration order</summary>

`room_user` and `messages` reference `rooms`, so their migrations must run after it. Migrations run in filename (timestamp) order. Create them in the order above and you're fine.
</details>

---

## 02.2 🟢 Models and relationships

1. Add `#[Fillable]` to `Room` and `Message`, matching the style of `User.php`.
2. Add every relationship from lesson §4: `Room::owner/messages/members`, `Message::room/user`, `User::messages/rooms`.
3. Add return types (`BelongsTo`, `HasMany`, `BelongsToMany`) and the `@use HasFactory<…>` docblock.
4. In `AppServiceProvider::boot()`, enable `preventLazyLoading` and `preventSilentlyDiscardingAttributes` for non-production.

**Done when** this works in `lerd artisan tinker` without errors:

```php
$u = App\Models\User::first();
$r = App\Models\Room::create(['name' => 'Test', 'slug' => 'test', 'owner_id' => $u->id]);
$r->members()->attach($u);
$r->messages()->create(['user_id' => $u->id, 'body' => 'hi']);
$r->load('messages.user', 'members')->toArray();
```

<details><summary>Hint</summary>

`$r->messages()->create([...])` fills `room_id` for you, but `user_id` and `body` must be in `Message`'s `Fillable`.
</details>

---

## 02.3 🟢 Factories and a seeder

1. `RoomFactory`: name, slug derived from the name, description, `owner_id => User::factory()`.
2. `MessageFactory`: `room_id => Room::factory()`, `user_id => User::factory()`, `body => fake()->sentence()`.
3. `DatabaseSeeder`:
   - 4 known users: Ada, Linus, Grace, Alan (`ada@example.com`, …). The factory's default password is `password`; check `UserFactory`.
   - 3 rooms: `general`, `random`, `dev`, owned by Ada.
   - Everyone is a member of `general`. Only Ada and Linus are members of `dev`.
   - 20 messages in each room, from members of that room only.

**Done when** `lerd artisan migrate:fresh --seed` succeeds, and in tinker `App\Models\Room::where('slug','dev')->first()->members()->count()` is `2`.

<details><summary>Hint 1: messages from members only</summary>

```php
Message::factory()
    ->count(20)
    ->for($room)
    ->state(fn () => ['user_id' => $room->members->random()->id])
    ->create();
```

A closure state runs once per model, so each message picks a fresh random member.
</details>

<details><summary>Hint 2: spread timestamps</summary>

Messages all created in the same second sort unpredictably. Add `'created_at' => fake()->dateTimeBetween('-2 days')` to `MessageFactory`.
</details>

---

## 02.4 🟢 Swap fake data for the database

1. `RoomController::index`: real rooms with `id, name, slug, description`.
2. Change the route to `/rooms/{room:slug}` and `show(Room $room)`.
3. `show`: load the **latest 50 messages, displayed oldest→newest**, each with its author's name.
4. Share the sidebar rooms from the database in `HandleInertiaRequests`, and delete `FakeChat` if you made it.
5. Update the Vue pages and links to use slugs.

**Done when** `/rooms/general` shows seeded messages in chronological order, `/rooms/nope` is a 404, and no `LazyLoadingViolationException` appears.

<details><summary>Hint 1: latest 50, oldest first</summary>

Fetch `latest()->take(50)` (newest first), then flip it in PHP: `->get()->reverse()->values()`. `values()` re-indexes so it serializes as a JSON array, not an object.
</details>

<details><summary>Hint 2: Wayfinder with slugs</summary>

`show(room.slug)`. The sidebar's "current room" check becomes `page.url === show.url(room.slug)`.
</details>

---

## 02.5 🟡 Count your queries

1. Temporarily remove `with('user')` from `show`. Load the page. What happens?
2. Put it back. Now prove how many queries `show` runs. Use the lerd dashboard's query capture, or in tinker:

```php
DB::enableQueryLog();
// …run the same code as your controller…
count(DB::getQueryLog());
```

**Done when** you can state the query count with and without eager loading, and explain the difference.

<details><summary>Hint</summary>

Without `preventLazyLoading` it would be 1 + 50 (+ the room lookup). With it, you get an exception instead. That's the point.
</details>

---

## 02.6 🟡 MessageResource

1. `lerd artisan make:resource MessageResource --no-interaction`
2. Shape: `id`, `body`, `sent_at` (ISO 8601), `author: { id, name }`.
3. Use it in `show`. Format the time in Vue (e.g. `new Date(m.sent_at).toLocaleTimeString()`).
4. Check the Network tab: no `email`, no `updated_at`, no `room_id` in the response.

**Done when** the props for `rooms/Show` contain exactly those fields.

<details><summary>Hint</summary>

Resources wrap collections in `{ data: [...] }` by default. In Inertia props you usually want the plain array: `MessageResource::collection($messages)->resolve()`. Or keep `data` and read `messages.data` in Vue. Pick one and be consistent.
</details>

---

## 02.7 🟡 Room list with counts

On `/rooms`, show each room's **member count** and **message count** without N+1.

**Done when** the page shows both counts and the controller runs a fixed number of queries no matter how many rooms there are.

<details><summary>Hint</summary>

`Room::withCount(['members', 'messages'])` adds `members_count` and `messages_count` attributes with subqueries.
</details>

---

## 02.8 🔴 Last message preview

On `/rooms`, show each room's most recent message body, truncated to 60 characters.

**Done when** it works with a fixed number of queries. Bonus: also try `with(['messages' => fn ($q) => $q->latest()->limit(1)])`. Since Laravel 11 that is correct per room too. What's the practical difference between the two in Vue?

<details><summary>Hint</summary>

Look up `latestOfMany()` in the Eloquent relationships docs: `public function latestMessage(): HasOne { return $this->hasOne(Message::class)->latestOfMany(); }`
</details>
