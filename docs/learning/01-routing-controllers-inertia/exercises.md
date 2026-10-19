# 01 · Exercises

Commit after each one. Check the lerd `vite` worker is running so Wayfinder regenerates.

---

## 01.1 🟢 Inspect the wire

No code. Just look.

1. Open `https://laravel-reverb-example.test` with DevTools → Network open.
2. View the page source and find `<script data-page="app" type="application/json">`. That's the page object embedded in the HTML. It's rendered by `<x-inertia::app />` in `resources/views/app.blade.php`.
3. Run `lerd artisan route:list --except-vendor`.

**Done when** you can name the component and every prop key in the page object, including the ones you didn't pass yourself.

<details><summary>Hint</summary>

Some props come from `HandleInertiaRequests::share()`, not from the route. `errors` is always present.
</details>

---

## 01.2 🟢 Rooms list with fake data

1. Create `RoomController` with `lerd artisan make:controller RoomController --no-interaction`.
2. Add an `index` method that renders `rooms/Index` with a `rooms` prop: an array of 3 rooms, each `['id' => …, 'name' => …, 'description' => …]`.
3. Add the route `GET /rooms` named `rooms.index`.
4. Create `resources/js/pages/rooms/Index.vue`, type the prop with `defineProps<…>()` and list the rooms.

**Done when** `/rooms` shows three rooms, and `route:list` shows `rooms.index → RoomController@index`.

<details><summary>Hint 1</summary>

The method should declare its return type: `use Inertia\Response;` then `public function index(): Response`.
</details>

<details><summary>Hint 2</summary>

Keep the fake data in a private method such as `private function fakeRooms(): array` so `show` can reuse it in the next exercise.
</details>

---

## 01.3 🟢 Room page and a 404

1. Add `show(int $room)` and the route `GET /rooms/{room}` named `rooms.show`.
2. Find the room in your fake array. If it doesn't exist, return a 404.
3. Render `rooms/Show` with a `room` prop and a `messages` prop: 3 fake messages per room, each `['id', 'author', 'body', 'sent_at']`.
4. On the index page, make each room a `<Link>` built with Wayfinder: `show(room.id)`.

**Done when** clicking a room opens it **without a full page reload** (the Network tab shows an XHR with `X-Inertia: true`), and `/rooms/999` returns a 404.

<details><summary>Hint 1</summary>

`abort_if($condition, 404);` or `abort(404);`
</details>

<details><summary>Hint 2</summary>

`collect($this->fakeRooms())->firstWhere('id', $room)` returns the room or `null`.
</details>

---

## 01.4 🟢 Persistent layout

1. Create `resources/js/layouts/AppLayout.vue` with a header ("Team Chat" + a link to the rooms list) and a `<slot />`.
2. Apply it to both pages with `defineOptions({ layout: AppLayout })`.
3. In the layout, add a counter: `const clicks = ref(0)` and a button that increments it.

**Done when** you click the counter to 5, navigate to a room and back, and it still shows 5. That's the "persistent" part.

<details><summary>Hint</summary>

If it resets to 0, you're wrapping `<AppLayout>` inside the page template instead of using `defineOptions`. Wrapping recreates the layout on every visit.
</details>

Remove the counter when you're done.

---

## 01.5 🟡 Share the room list with every page

The sidebar should list all rooms on every page, but you don't want every controller to pass them.

1. Share `rooms` (id + name only) from `HandleInertiaRequests::share()`.
2. Show them in the layout's sidebar using `usePage()`.
3. Add the type to `sharedPageProps` in `resources/js/types/global.d.ts`.
4. Highlight the current room in the sidebar.

**Done when** the sidebar appears on both pages, the current room is highlighted, and TypeScript doesn't complain about `page.props.rooms`.

<details><summary>Hint 1</summary>

Use a closure: `'rooms' => fn () => …`. It only runs when the prop is actually sent, which matters later for partial reloads.
</details>

<details><summary>Hint 2</summary>

For the current room, compare against `page.url`, or use Wayfinder: `page.url === show.url(room.id)`.
</details>

<details><summary>Hint 3</summary>

The fake data lives in `RoomController`. To reuse it from the middleware, move it to a small class (`lerd artisan make:class Support/FakeChat`). Module 02 replaces it with the database anyway.
</details>

---

## 01.6 🟡 Replace the welcome page

Make `/` redirect to `/rooms`. Keep the route named `home`.

**Done when** visiting `/` lands on `/rooms` and `route:list` still shows `home`.

<details><summary>Hint</summary>

`Route::redirect('/', '/rooms')` returns a route like any other, so you can chain `->name('home')` on it.
</details>

> Your Reverb demo lives in `Welcome.vue`. Keep the file, since module 05 comes back to it. Just stop routing `/` to it.

---

## 01.7 🔴 Read the framework

Answer by reading code, not docs:

1. In `vendor/inertiajs/inertia-laravel/src/` (start with `Response.php` and `Middleware.php`), find where Inertia decides between returning HTML and JSON. What does it check?
2. In the same package, find what happens when the asset version doesn't match. What status code does Inertia send, and why?

**Done when** you can explain both answers in a sentence each.

<details><summary>Hint</summary>

Search the package for `X-Inertia` and `409`.
</details>
