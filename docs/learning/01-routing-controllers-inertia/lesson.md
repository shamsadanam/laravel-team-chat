# 01 · Routing, controllers, Inertia

**Goal:** understand what happens between "browser asks for `/rooms`" and "Vue shows a list", then build the chat app's first two pages with fake data.

**You'll touch:** `routes/web.php`, `app/Http/Controllers/`, `resources/js/pages/`, `resources/js/layouts/`.

---

## 1. The life of a request

Opening `https://laravel-reverb-example.test/rooms` sets off this chain:

```
Browser
  │  GET /rooms
  ▼
nginx (lerd)               → hands every request to PHP
  ▼
public/index.php           → the single entry point; boots Laravel
  ▼
bootstrap/app.php          → configures routing, middleware, exceptions
  ▼
Middleware ("web" group)   → starts the session, checks CSRF, runs HandleInertiaRequests…
  ▼
Router (routes/web.php)    → finds the route matching GET /rooms
  ▼
Controller method          → your code: fetch data, return a response
  ▼
Response travels back up through the middleware → browser
```

Two ideas to take away:

- **Every request starts from zero.** PHP builds the app, handles one request and forgets everything. Anything that must survive between requests lives in the database, the session or the cache. This matters later: Reverb is a *long-running* process and works differently.
- **Middleware wraps your code.** Open `bootstrap/app.php`. `HandleInertiaRequests` is added to the `web` group, so it runs on every page request.

## 2. Routes

`routes/web.php` maps a **method + URL** to code:

```php
use App\Http\Controllers\RoomController;
use Illuminate\Support\Facades\Route;

Route::get('/rooms', [RoomController::class, 'index'])->name('rooms.index');
Route::get('/rooms/{room}', [RoomController::class, 'show'])->name('rooms.show');
```

- `{room}` is a **route parameter**. Whatever is in that URL segment is passed to the controller method.
- `->name('rooms.show')` gives the route a name. Code refers to the name, not the URL, so you can change the URL later without breaking links.

Your project already has a shortcut route:

```php
Route::inertia('/', 'Welcome')->name('home');
```

`Route::inertia` means "render this Vue page, no controller needed". Use it for static pages.

**See every route:** `lerd artisan route:list --except-vendor`

## 3. Controllers

A controller is a class that groups related request handlers. Create one with:

```bash
lerd artisan make:controller RoomController --no-interaction
```

Laravel's naming convention for resource controllers (follow it, other tools rely on it):

| Method | Route | Purpose |
| --- | --- | --- |
| `index` | `GET /rooms` | list |
| `create` | `GET /rooms/create` | show a "new" form |
| `store` | `POST /rooms` | save a new one |
| `show` | `GET /rooms/{room}` | show one |
| `edit` / `update` | `GET /rooms/{room}/edit`, `PUT/PATCH /rooms/{room}` | edit |
| `destroy` | `DELETE /rooms/{room}` | delete |

A controller method takes the request in and returns a response. For you, that response is usually an Inertia page or a redirect.

## 4. Inertia: the bridge

Without Inertia you'd choose between:
- **Blade** (server-rendered HTML): simple, but no rich Vue interactivity, or
- **a JSON API + a separate SPA**: interactive, but you build and maintain two apps, routing twice, auth twice.

Inertia gives you Vue pages that use **Laravel's routing, controllers and sessions**. There's no API to design.

```php
use Inertia\Inertia;

public function index(): Response
{
    return Inertia::render('rooms/Index', [
        'rooms' => [
            ['id' => 1, 'name' => 'General'],
            ['id' => 2, 'name' => 'Random'],
        ],
    ]);
}
```

- `'rooms/Index'` is the component name. It maps to `resources/js/pages/rooms/Index.vue`.
- The array is the page's **props**. Inertia serializes it to JSON and Vue receives it.

### What actually travels over the wire

**First visit** (typing the URL or a hard refresh): Laravel returns full HTML, `resources/views/app.blade.php`, with the page data embedded. Vue boots and renders `rooms/Index`.

**Every visit after that** (clicking an Inertia `<Link>`): the browser sends an XHR with an `X-Inertia: true` header. Laravel sees the header and returns **JSON only**:

```json
{
  "component": "rooms/Index",
  "props": { "rooms": [ ... ], "auth": { "user": null }, "errors": {} },
  "url": "/rooms",
  "version": "…"
}
```

Inertia swaps the component and props without reloading the page. Open DevTools → Network, click a link and look at this response. You'll use that habit all course.

> ⚠️ **Props are public.** Everything you pass ends up in the browser. Never pass a full model that has secrets in it, and send only the fields the page needs.

### Receiving props in Vue

```vue
<script setup lang="ts">
type Room = { id: number; name: string };

defineProps<{ rooms: Room[] }>();
</script>

<template>
    <ul>
        <li v-for="room in rooms" :key="room.id">{{ room.name }}</li>
    </ul>
</template>
```

## 5. Shared data

Some data is needed on *every* page, such as the logged-in user or the app name. Rather than add it to each controller, the `share()` method in `app/Http/Middleware/HandleInertiaRequests.php` merges it into every response:

```php
return [
    ...parent::share($request),
    'name' => config('app.name'),
    'auth' => [
        'user' => $request->user(),
    ],
];
```

In Vue, read it from anywhere with `usePage()`:

```ts
import { usePage } from '@inertiajs/vue3';

const page = usePage();
page.props.auth.user; // null until module 04
```

The types for shared props live in `resources/js/types/global.d.ts` (`sharedPageProps`).

Keep shared data small: it's sent with every single response.

## 6. Links and Wayfinder

Use Inertia's `<Link>`, not `<a>`, for links inside the app. A plain `<a>` reloads the whole page.

```vue
<Link href="/rooms/1">General</Link>
```

Hardcoded URLs break when routes change. **Wayfinder** reads your Laravel routes and generates TypeScript functions for them. The `wayfinder()` plugin in `vite.config.ts` regenerates them whenever routes change, as long as Vite is running.

```ts
import { index, show } from '@/actions/App/Http/Controllers/RoomController';

show.url(1);  // "/rooms/1"
show(1);      // { url: "/rooms/1", method: "get" }
```

`<Link>` accepts the object directly:

```vue
<Link :href="show(room.id)">{{ room.name }}</Link>
```

Rename `/rooms` to `/channels` in `web.php` and every link updates. Remove a route and TypeScript shows an error at every call site.

There are two import styles:
- `@/actions/App/Http/Controllers/RoomController`: by **controller method**
- `@/routes/rooms`: by **route name** (`rooms.show` → `show` in `@/routes/rooms`)

Use named imports (`import { show }`) rather than default imports, so unused routes are tree-shaken out of the bundle.

## 7. Layouts

Every chat page needs the same shell: a header and a room sidebar. Put it in a layout and make it **persistent**, so Inertia keeps it alive between page visits and its state survives navigation, such as scroll position or, later, a live WebSocket subscription.

```vue
<!-- resources/js/layouts/AppLayout.vue -->
<script setup lang="ts">
import { Link } from '@inertiajs/vue3';
</script>

<template>
    <div class="min-h-screen">
        <header class="border-b p-4"><Link href="/rooms">Chat</Link></header>
        <main class="p-4"><slot /></main>
    </div>
</template>
```

```vue
<!-- in a page -->
<script setup lang="ts">
import AppLayout from '@/layouts/AppLayout.vue';

defineOptions({ layout: AppLayout });
</script>
```

You can also set a **default layout** for all pages with the `layout` option of `createInertiaApp` in `resources/js/app.ts`.

> **Why this matters for Reverb:** with a persistent layout, a `useEcho…` call in the layout keeps listening while the user moves between rooms. Put the same call in a page instead and it disconnects and reconnects on every navigation.

## 8. Common mistakes

| Symptom | Cause |
| --- | --- |
| Blank page, console says the page component can't be found | Component name case doesn't match the file. `rooms/Index` ≠ `rooms/index`. |
| Clicking a link reloads the whole page | You used `<a>` instead of `<Link>`. |
| `@/actions/...RoomController` doesn't exist | Vite isn't running (check the lerd `vite` worker), or the route uses a closure instead of a controller. |
| Props are `undefined` in Vue | The prop key in PHP doesn't match `defineProps`, or you forgot `defineProps`. |
| 404 on a new route | Typo, or a route defined *after* a catch-all. Check `route:list`. |

## What you should be able to explain now

- Why PHP "forgets" between requests, and where state lives instead.
- What Laravel returns on a first visit vs. a `<Link>` click.
- What shared data is and why it should stay small.
- Why Wayfinder beats hardcoded URLs.

Next: [exercises](exercises.md).
