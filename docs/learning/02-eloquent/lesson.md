# 02 · Eloquent: models, migrations, relationships

**Goal:** replace the fake arrays with real tables, and learn to query them efficiently.

**You'll touch:** `database/migrations/`, `app/Models/`, `database/factories/`, `database/seeders/`, `RoomController`.

---

## 1. The chat's data model

```
users ──< messages >── rooms
  │                      │
  └──────< room_user >───┘      (membership: many-to-many)
```

| Table | Columns |
| --- | --- |
| `rooms` | `id`, `name`, `slug` (unique), `description` (nullable), `owner_id` → users, timestamps |
| `room_user` | `room_id` → rooms, `user_id` → users, timestamps; primary key `(room_id, user_id)` |
| `messages` | `id`, `room_id` → rooms, `user_id` → users, `body`, timestamps; index `(room_id, created_at)` |

Membership becomes important in module 07: a private channel asks "is this user a member of this room?", and `room_user` answers that.

## 2. Migrations: schema as code

A migration is a PHP class that changes the schema. It's versioned in git, so everyone's database matches.

```bash
lerd artisan make:model Room -mfs --no-interaction   # model + migration + factory + seeder
lerd artisan make:model Message -mf --no-interaction
lerd artisan make:migration create_room_user_table --no-interaction
```

```php
// database/migrations/xxxx_create_rooms_table.php
public function up(): void
{
    Schema::create('rooms', function (Blueprint $table) {
        $table->id();
        $table->string('name');
        $table->string('slug')->unique();
        $table->text('description')->nullable();
        $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
        $table->timestamps();
    });
}
```

- `foreignId('owner_id')->constrained('users')` creates the column **and** a real foreign key constraint. Postgres will refuse a room whose owner doesn't exist.
- `cascadeOnDelete()`: deleting a user deletes their rooms. Decide this per relationship. For messages you might prefer to keep them and null the user.

```bash
lerd artisan migrate             # run pending migrations
lerd artisan migrate:status      # what has run
lerd artisan migrate:rollback    # undo the last batch (runs down())
lerd artisan migrate:fresh --seed  # drop everything, re-run, seed. Local only!
```

> **Rule:** never edit a migration that already ran somewhere else (a teammate's machine, production). Write a new one instead. Locally, before you share it, `migrate:fresh` is fine.

### Indexes are a design decision

The chat's hottest query is "the last 50 messages in room X". That's `WHERE room_id = ? ORDER BY created_at DESC LIMIT 50`. An index on `(room_id, created_at)` serves exactly that query:

```php
$table->index(['room_id', 'created_at']);
```

## 3. Models

A model is a class mapped to a table: `Room` → `rooms`. Match the style of `app/Models/User.php`, which uses PHP attributes:

```php
use Illuminate\Database\Eloquent\Attributes\Fillable;

#[Fillable(['name', 'slug', 'description', 'owner_id'])]
class Room extends Model
{
    /** @use HasFactory<RoomFactory> */
    use HasFactory;
}
```

### Mass assignment

`Room::create($request->all())` would let a user set *any* column, such as `owner_id`. `Fillable` is the allow-list of columns you can set in bulk. Anything not listed is silently dropped.

To make "silently" loud during development, add this to `AppServiceProvider::boot()`:

```php
Model::preventSilentlyDiscardingAttributes($this->app->isLocal());
```

## 4. Relationships

```php
// Room
public function owner(): BelongsTo
{
    return $this->belongsTo(User::class, 'owner_id');
}

public function messages(): HasMany
{
    return $this->hasMany(Message::class);
}

public function members(): BelongsToMany
{
    return $this->belongsToMany(User::class)->withTimestamps();
}
```

```php
// Message
public function room(): BelongsTo { return $this->belongsTo(Room::class); }
public function user(): BelongsTo { return $this->belongsTo(User::class); }

// User
public function messages(): HasMany { return $this->hasMany(Message::class); }
public function rooms(): BelongsToMany { return $this->belongsToMany(Room::class)->withTimestamps(); }
```

The naming conventions do the work:
- `belongsTo(User::class)` on `Message` assumes a `user_id` column. `owner()` doesn't follow the convention, so you pass `'owner_id'`.
- `belongsToMany(User::class)` assumes the pivot table `room_user`: both singular names, in alphabetical order.

Use them two ways:

```php
$room->messages;              // property → runs the query, returns a Collection
$room->messages()->latest()->take(50)->get();   // method → a query builder you can refine

$room->members()->attach($user);   // insert into room_user
$room->members()->detach($user);
$room->members()->where('users.id', $user->id)->exists();  // "is a member?"
```

## 5. Factories and seeders

**Factories** create fake models for development and tests:

```php
// RoomFactory::definition()
return [
    'name' => $name = fake()->unique()->words(2, true),
    'slug' => Str::slug($name),
    'description' => fake()->sentence(),
    'owner_id' => User::factory(),
];
```

`'owner_id' => User::factory()` creates a user only if you don't provide one. `Room::factory()->for($ada, 'owner')->create()` reuses Ada.

**Seeders** call factories to fill the database with a realistic dataset:

```php
$ada = User::factory()->create(['name' => 'Ada', 'email' => 'ada@example.com']);

Room::factory()
    ->for($ada, 'owner')
    ->hasAttached(User::factory()->count(5), [], 'members')
    ->create();
```

Run: `lerd artisan migrate:fresh --seed`.

## 6. Route model binding

Instead of `show(int $room)` plus a manual lookup:

```php
public function show(Room $room): Response   // Laravel finds it, or returns a 404
```

The `{room}` parameter name must match the variable name `$room`. To look up by slug instead of id:

```php
Route::get('/rooms/{room:slug}', [RoomController::class, 'show']);
```

Wayfinder follows along. After the route changes, call `show(room.slug)` or `show({ slug: room.slug })`.

## 7. The N+1 problem

The most common Eloquent performance bug:

```php
$messages = $room->messages()->latest()->take(50)->get();   // 1 query

foreach ($messages as $message) {
    echo $message->user->name;    // 1 query PER message → 50 more
}
```

That's 51 queries where 2 would do. The fix is **eager loading**:

```php
$messages = $room->messages()->with('user:id,name')->latest()->take(50)->get();
// select * from messages … ; select id, name from users where id in (…)
```

`'user:id,name'` loads only those columns. When you list columns, you must include the key (`id`).

**Make it impossible to forget.** In `AppServiceProvider::boot()`:

```php
Model::preventLazyLoading(! $this->app->isProduction());
```

Now any lazy load throws an exception in development, and the error page shows you the exact line.

## 8. What goes to the browser

`Inertia::render('rooms/Show', ['room' => $room])` sends `$room->toArray()`: every column plus every loaded relationship. Fine for `rooms`, dangerous for `users` (emails!). Control it with:

- `$room->only('id', 'name', 'slug')` for one-offs, or
- **API Resources**: a class that defines the JSON shape once.

```bash
lerd artisan make:resource MessageResource --no-interaction
```

```php
public function toArray(Request $request): array
{
    return [
        'id' => $this->id,
        'body' => $this->body,
        'sent_at' => $this->created_at->toIso8601String(),
        'author' => ['id' => $this->user->id, 'name' => $this->user->name],
    ];
}
```

```php
'messages' => MessageResource::collection($messages),
```

> **Why this matters for Reverb:** in module 06 you'll broadcast a new message. The page loads messages in one shape and the WebSocket delivers them in another, and the UI breaks in subtle ways when those shapes differ. With one resource class, both paths send the same shape.

## 9. Common mistakes

| Symptom | Cause |
| --- | --- |
| `SQLSTATE… could not translate host name "lerd-postgres"` | You ran `php artisan` on the host. Use `lerd artisan`. |
| `Add [name] to fillable property` (or the field silently stays null) | Column missing from `#[Fillable]`. |
| `LazyLoadingViolationException` | Good, it's working. Add `with(...)`. |
| `Base table room_users not found` | Wrong pivot name. The convention is singular + alphabetical: `room_user`. |
| Route model binding returns 404 for a slug | You forgot `{room:slug}` in the route. |
| `SQLSTATE[23503]` foreign key violation | Creating a child with a parent id that doesn't exist. Check your factory or seeder order. |

## What you should be able to explain now

- Why migrations exist, and why you don't edit ones that have already run elsewhere.
- What `Fillable` protects against.
- The difference between `$room->messages` and `$room->messages()`.
- What N+1 is and two ways to defend against it.
- Why you control the shape of data sent to the browser.

Next: [exercises](exercises.md).
