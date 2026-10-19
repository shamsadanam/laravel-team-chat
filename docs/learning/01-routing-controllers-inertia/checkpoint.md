# 01 · Checkpoint

Answer without looking. Then check against the lesson.

1. PHP forgets everything after each request. Name three places where state *can* survive between requests.
2. What's the difference between what Laravel returns on a first visit to `/rooms` and on an Inertia `<Link>` click to `/rooms`? Which header decides it?
3. You pass `'user' => $user` (a full `User` model) as a prop. What's the risk, and what should you do instead?
4. What does `Route::inertia('/about', 'About')` save you from writing?
5. Why should a value in `HandleInertiaRequests::share()` usually be a closure?
6. Give two reasons to use Wayfinder's `show(room.id)` over the string `` `/rooms/${room.id}` ``.
7. You wrap a page's template in `<AppLayout>…</AppLayout>` instead of using `defineOptions({ layout: AppLayout })`. What breaks, and why will it matter once you add WebSockets?
8. A colleague's link does a full page reload every time. What's the most likely cause?

<details><summary>Answers</summary>

1. Database, session (cookie-linked, stored in your `sessions` table), cache. Also files and the queue.
2. First visit: a full HTML document with the page object embedded. `<Link>` click: XHR with `X-Inertia: true`, and the response is JSON only (`component`, `props`, `url`, `version`).
3. Every attribute that isn't hidden ends up in the browser and in the page source. Send only what the page needs: `$user->only('id', 'name')`, or an API Resource.
4. A controller (or closure) that does nothing but `Inertia::render('About')`.
5. It's only evaluated when the prop is actually included, so partial reloads can skip the query.
6. Type safety (a removed or renamed route breaks the build instead of the user's click), and a single source of truth for URLs. It also carries the HTTP method.
7. The layout is destroyed and recreated on every navigation, so its state resets. A WebSocket subscription inside it would unsubscribe and resubscribe on every page change.
8. They used `<a href>` instead of Inertia's `<Link>`.
</details>
