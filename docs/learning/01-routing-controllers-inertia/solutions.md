# 01 · Solutions

Read these only after you've finished the exercise or been stuck for about 30 minutes. If your version works and looks different, that's fine.

---

## 01.1 Inspect the wire

The page object for `/` looks roughly like:

```json
{
  "component": "Welcome",
  "props": {
    "errors": {},
    "name": "Laravel",
    "auth": { "user": null }
  },
  "url": "/",
  "version": "…"
}
```

- `component`: from `Route::inertia('/', 'Welcome')`.
- `name`, `auth`: from `HandleInertiaRequests::share()`.
- `errors`: always added by the Inertia Laravel adapter, `{}` when there are no validation errors.

---

## 01.2 + 01.3 Rooms list and room page

`app/Http/Controllers/RoomController.php`:

```php
<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;

class RoomController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('rooms/Index', [
            'rooms' => $this->fakeRooms(),
        ]);
    }

    public function show(int $room): Response
    {
        $found = collect($this->fakeRooms())->firstWhere('id', $room);

        abort_if($found === null, 404);

        return Inertia::render('rooms/Show', [
            'room' => $found,
            'messages' => [
                ['id' => 1, 'author' => 'Ada', 'body' => 'Hello!', 'sent_at' => '09:00'],
                ['id' => 2, 'author' => 'Linus', 'body' => 'Hi Ada', 'sent_at' => '09:01'],
                ['id' => 3, 'author' => 'Ada', 'body' => 'Coffee?', 'sent_at' => '09:02'],
            ],
        ]);
    }

    /**
     * @return array<int, array{id: int, name: string, description: string}>
     */
    private function fakeRooms(): array
    {
        return [
            ['id' => 1, 'name' => 'General', 'description' => 'Company-wide chat'],
            ['id' => 2, 'name' => 'Random', 'description' => 'Off-topic'],
            ['id' => 3, 'name' => 'Dev', 'description' => 'Engineering talk'],
        ];
    }
}
```

`routes/web.php`:

```php
use App\Http\Controllers\RoomController;
use Illuminate\Support\Facades\Route;

Route::get('/rooms', [RoomController::class, 'index'])->name('rooms.index');
Route::get('/rooms/{room}', [RoomController::class, 'show'])->name('rooms.show');
```

`resources/js/pages/rooms/Index.vue`:

```vue
<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { show } from '@/actions/App/Http/Controllers/RoomController';

type Room = { id: number; name: string; description: string };

defineProps<{ rooms: Room[] }>();
</script>

<template>
    <Head title="Rooms" />
    <h1 class="mb-4 text-xl font-semibold">Rooms</h1>
    <ul class="space-y-2">
        <li v-for="room in rooms" :key="room.id">
            <Link :href="show(room.id)" class="font-medium underline">
                # {{ room.name }}
            </Link>
            <p class="text-sm opacity-70">{{ room.description }}</p>
        </li>
    </ul>
</template>
```

`resources/js/pages/rooms/Show.vue`:

```vue
<script setup lang="ts">
import { Head } from '@inertiajs/vue3';

type Room = { id: number; name: string; description: string };
type Message = { id: number; author: string; body: string; sent_at: string };

defineProps<{ room: Room; messages: Message[] }>();
</script>

<template>
    <Head :title="`# ${room.name}`" />
    <h1 class="mb-4 text-xl font-semibold"># {{ room.name }}</h1>
    <ul class="space-y-2">
        <li v-for="message in messages" :key="message.id">
            <strong>{{ message.author }}</strong>
            <span class="text-xs opacity-60">{{ message.sent_at }}</span>
            <p>{{ message.body }}</p>
        </li>
    </ul>
</template>
```

---

## 01.4 Persistent layout

`resources/js/layouts/AppLayout.vue`:

```vue
<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
import { index } from '@/actions/App/Http/Controllers/RoomController';
</script>

<template>
    <div class="min-h-screen">
        <header class="flex items-center gap-4 border-b p-4">
            <Link :href="index()" class="font-semibold">Team Chat</Link>
        </header>
        <main class="p-4">
            <slot />
        </main>
    </div>
</template>
```

In both pages, inside `<script setup>`:

```ts
import AppLayout from '@/layouts/AppLayout.vue';

defineOptions({ layout: AppLayout });
```

The counter survives navigation because Inertia mounts the layout once and only swaps the page inside `<slot />`.

---

## 01.5 Share the room list

Move the fake data out of the controller so both places can use it.

`app/Support/FakeChat.php` (created with `lerd artisan make:class Support/FakeChat`):

```php
<?php

namespace App\Support;

class FakeChat
{
    /**
     * @return array<int, array{id: int, name: string, description: string}>
     */
    public static function rooms(): array
    {
        return [
            ['id' => 1, 'name' => 'General', 'description' => 'Company-wide chat'],
            ['id' => 2, 'name' => 'Random', 'description' => 'Off-topic'],
            ['id' => 3, 'name' => 'Dev', 'description' => 'Engineering talk'],
        ];
    }
}
```

`HandleInertiaRequests::share()`:

```php
return [
    ...parent::share($request),
    'name' => config('app.name'),
    'auth' => [
        'user' => $request->user(),
    ],
    'rooms' => fn () => collect(FakeChat::rooms())
        ->map(fn (array $room) => ['id' => $room['id'], 'name' => $room['name']])
        ->all(),
];
```

`resources/js/types/global.d.ts`, inside `sharedPageProps`:

```ts
rooms: { id: number; name: string }[];
```

Layout sidebar:

```vue
<script setup lang="ts">
import { Link, usePage } from '@inertiajs/vue3';
import { index, show } from '@/actions/App/Http/Controllers/RoomController';

const page = usePage();
</script>

<template>
    <div class="flex min-h-screen">
        <aside class="w-56 border-r p-4">
            <Link :href="index()" class="mb-4 block font-semibold">Team Chat</Link>
            <ul class="space-y-1">
                <li v-for="room in page.props.rooms" :key="room.id">
                    <Link
                        :href="show(room.id)"
                        :class="{ 'font-bold': page.url === show.url(room.id) }"
                    >
                        # {{ room.name }}
                    </Link>
                </li>
            </ul>
        </aside>
        <main class="flex-1 p-4">
            <slot />
        </main>
    </div>
</template>
```

**Why a closure?** `'rooms' => fn () => …` is evaluated only when the prop is included in the response. In module 10 you'll do partial reloads (`only: ['messages']`) and skip the sidebar query entirely.

---

## 01.6 Redirect home

```php
Route::redirect('/', '/rooms')->name('home');
```

---

## 01.7 Read the framework

1. **HTML vs JSON:** `Inertia\Response::toResponse()` checks `if ($request->header(Header::INERTIA))`. With the `X-Inertia` header it returns a JSON page object; without it, it renders the Blade root view with the page embedded.
2. **Version mismatch:** in `Middleware::handle()`, for Inertia GET requests whose `X-Inertia-Version` header differs from the server's version, `onVersionChange()` returns `Inertia::location($request->fullUrl())`, which is a **409 Conflict** with an `X-Inertia-Location` header. The client then does a **full page load**. Why: you deployed new JS/CSS, and the open tab still runs the old bundle. A hard reload is the only way to pick up the new assets.
