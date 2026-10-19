# 02 · Solutions

---

## 02.1 Tables

`create_rooms_table`:

```php
Schema::create('rooms', function (Blueprint $table) {
    $table->id();
    $table->string('name');
    $table->string('slug')->unique();
    $table->text('description')->nullable();
    $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
    $table->timestamps();
});
```

`create_messages_table`:

```php
Schema::create('messages', function (Blueprint $table) {
    $table->id();
    $table->foreignId('room_id')->constrained()->cascadeOnDelete();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->text('body');
    $table->timestamps();

    $table->index(['room_id', 'created_at']);
});
```

`create_room_user_table`:

```php
Schema::create('room_user', function (Blueprint $table) {
    $table->foreignId('room_id')->constrained()->cascadeOnDelete();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->timestamps();

    $table->primary(['room_id', 'user_id']);
});
```

Each `down()` is `Schema::dropIfExists('…')`.

If `make:model -m` created the messages migration *before* you made the rooms one, rename the file's timestamp so it sorts after `rooms`.

---

## 02.2 Models

`app/Models/Room.php`:

```php
<?php

namespace App\Models;

use Database\Factories\RoomFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'slug', 'description', 'owner_id'])]
class Room extends Model
{
    /** @use HasFactory<RoomFactory> */
    use HasFactory;

    /**
     * @return BelongsTo<User, $this>
     */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    /**
     * @return HasMany<Message, $this>
     */
    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    /**
     * @return BelongsToMany<User, $this>
     */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class)->withTimestamps();
    }
}
```

`app/Models/Message.php`:

```php
#[Fillable(['room_id', 'user_id', 'body'])]
class Message extends Model
{
    /** @use HasFactory<MessageFactory> */
    use HasFactory;

    /**
     * @return BelongsTo<Room, $this>
     */
    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
```

`User` additions:

```php
/**
 * @return HasMany<Message, $this>
 */
public function messages(): HasMany
{
    return $this->hasMany(Message::class);
}

/**
 * @return BelongsToMany<Room, $this>
 */
public function rooms(): BelongsToMany
{
    return $this->belongsToMany(Room::class)->withTimestamps();
}
```

`AppServiceProvider::boot()`:

```php
use Illuminate\Database\Eloquent\Model;

Model::preventLazyLoading(! $this->app->isProduction());
Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());
```

> `Model::shouldBeStrict(! $this->app->isProduction())` turns on both, plus `preventAccessingMissingAttributes`, in one line.

---

## 02.3 Factories and seeder

`RoomFactory::definition()`:

```php
$name = fake()->unique()->words(2, true);

return [
    'name' => Str::title($name),
    'slug' => Str::slug($name),
    'description' => fake()->sentence(),
    'owner_id' => User::factory(),
];
```

`MessageFactory::definition()`:

```php
return [
    'room_id' => Room::factory(),
    'user_id' => User::factory(),
    'body' => fake()->sentence(),
    'created_at' => fake()->dateTimeBetween('-2 days'),
];
```

`DatabaseSeeder::run()`:

```php
$users = collect(['Ada', 'Linus', 'Grace', 'Alan'])->map(
    fn (string $name) => User::factory()->create([
        'name' => $name,
        'email' => strtolower($name).'@example.com',
    ])
);

[$ada, $linus] = [$users[0], $users[1]];

$memberships = [
    'general' => $users,
    'random' => $users,
    'dev' => collect([$ada, $linus]),
];

foreach ($memberships as $slug => $members) {
    $room = Room::factory()->for($ada, 'owner')->create([
        'name' => Str::title($slug),
        'slug' => $slug,
    ]);

    $room->members()->attach($members->pluck('id'));

    Message::factory()
        ->count(20)
        ->for($room)
        ->state(fn () => ['user_id' => $members->random()->id])
        ->create();
}
```

All four users log in with password `password` (from `UserFactory`). You'll use them in module 04.

---

## 02.4 Real data in the controller

Route:

```php
Route::get('/rooms/{room:slug}', [RoomController::class, 'show'])->name('rooms.show');
```

Controller:

```php
public function index(): Response
{
    return Inertia::render('rooms/Index', [
        'rooms' => Room::query()
            ->orderBy('name')
            ->get(['id', 'name', 'slug', 'description']),
    ]);
}

public function show(Room $room): Response
{
    $messages = $room->messages()
        ->with('user:id,name')
        ->latest()
        ->take(50)
        ->get()
        ->reverse()
        ->values();

    return Inertia::render('rooms/Show', [
        'room' => $room->only('id', 'name', 'slug', 'description'),
        'messages' => $messages,
    ]);
}
```

`HandleInertiaRequests::share()`:

```php
'rooms' => fn () => Room::query()->orderBy('name')->get(['id', 'name', 'slug']),
```

In Vue, `show(room.slug)` everywhere, and the message author is `message.user.name` (until 02.6 changes the shape).

---

## 02.5 Count your queries

- **Without** `with('user')`: `preventLazyLoading` throws `LazyLoadingViolationException` on the first `$message->user` access, which happens during serialization. Without that guard it would be 1 (messages) + up to 50 (one per message's user). The room lookup from route binding adds 1 more.
- **With** it: room lookup + messages + one `users where id in (…)` = **3 queries**, whatever the number of messages. The shared `rooms` prop adds 1 more.

---

## 02.6 MessageResource

```php
class MessageResource extends JsonResource
{
    /**
     * @return array{id: int, body: string, sent_at: string, author: array{id: int, name: string}}
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'body' => $this->body,
            'sent_at' => $this->created_at->toIso8601String(),
            'author' => [
                'id' => $this->user->id,
                'name' => $this->user->name,
            ],
        ];
    }
}
```

Controller:

```php
'messages' => MessageResource::collection($messages)->resolve(),
```

Vue type:

```ts
type Message = {
    id: number;
    body: string;
    sent_at: string;
    author: { id: number; name: string };
};
```

`->resolve()` returns the plain array. Without it, Inertia calls `toResponse()` on the resource and you get `{ data: [...] }`.

---

## 02.7 Counts

```php
'rooms' => Room::query()
    ->withCount(['members', 'messages'])
    ->orderBy('name')
    ->get(['id', 'name', 'slug', 'description']),
```

Vue reads `room.members_count` and `room.messages_count`. That's one query with two subselects.

---

## 02.8 Last message preview

```php
// Room
/**
 * @return HasOne<Message, $this>
 */
public function latestMessage(): HasOne
{
    return $this->hasOne(Message::class)->latestOfMany();
}
```

```php
Room::query()
    ->with('latestMessage:id,room_id,body,created_at')
    ->withCount(['members', 'messages'])
    ->orderBy('name')
    ->get(['id', 'name', 'slug', 'description']);
```

Truncate in PHP (`Str::limit($body, 60)`) or in Vue.

**Bonus:** `latestOfMany()` gives you a single model (`room.latest_message`, or `null`). The limited `messages` eager load gives you a one-item array (`room.messages[0]`), which is clumsier in templates, and the relationship name lies about what's loaded.
