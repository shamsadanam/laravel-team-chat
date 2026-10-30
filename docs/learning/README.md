# Laravel + Reverb: from zero to realtime

A hands-on course built around **this project**. You build one app the whole way through, a **team chat**, and each module adds a layer to it.

By the end you'll be able to design, build, test and deploy realtime features in Laravel: live feeds, chat, presence ("who's online"), notifications, collaborative UIs.

## Your stack

| Piece        | Version                                             | Role                                                  |
| ------------ | --------------------------------------------------- | ----------------------------------------------------- |
| Laravel      | 13.x                                                | Backend framework                                     |
| PHP          | 8.5                                                 | Language                                              |
| Inertia      | v3 (`inertiajs/inertia-laravel`, `@inertiajs/vue3`) | Lets Laravel render Vue pages without building an API |
| Vue          | 3.5                                                 | Frontend                                              |
| Wayfinder    | 0.1.x                                               | Generates typed TS functions for your Laravel routes  |
| Reverb       | 1.x                                                 | WebSocket server                                      |
| Laravel Echo | `@laravel/echo-vue` 2.x                             | Browser-side WebSocket client                         |
| Postgres     | via lerd                                            | Database                                              |
| Pest         |                                                     | Tests                                                 |

## How to run things in this project

The project runs on **lerd**. The database host (`lerd-postgres`) only exists inside lerd's container network. So:

- Use **`lerd artisan ...`** for every Artisan command. `php artisan migrate` on your host fails because it can't reach Postgres.
- Reverb, Vite, the queue and the scheduler already run as lerd workers (see `.lerd.yaml`). Check them with `lerd worker list`, or open the lerd dashboard.
- Open the app at `https://laravel-reverb-example.test`.

When a lesson says "run `lerd artisan make:model Room`", run it exactly like that.

## Roadmap

### Part A: Laravel foundations

You need these before realtime makes sense. A private channel is just authorization plus a model, and you can't broadcast a message you can't save.

| #   | Module                                                                    | You build                                                 |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| 01  | [Routing, controllers, Inertia](01-routing-controllers-inertia/01-lesson.md) | Room list and room page with fake data                    |
| 02  | [Eloquent](02-eloquent/01-lesson.md)                                         | Real `Room`, `Message` and membership tables, seeded data |
| 03  | [Forms and validation](03-forms-validation/01-lesson.md)                     | Create rooms, post messages                               |
| 04  | [Auth by hand](04-auth-by-hand/01-lesson.md)                                 | Login/logout, protected routes, "members only" policy     |

### Part B: Realtime with Reverb

| #   | Module                                                              | You build                                                           |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 05  | [Mental model](05-mental-model/01-lesson.md)                           | How WebSockets, Reverb and Echo fit together; debugging connections |
| 06  | [Public channels](06-public-channels/01-lesson.md)                     | Messages appear live for everyone                                   |
| 07  | [Private channels](07-private-channels/01-lesson.md)                   | Only room members receive messages                                  |
| 08  | [Presence](08-presence/01-lesson.md)                                   | "Who's here" list, typing indicator                                 |
| 09  | [Model events and notifications](09-models-notifications/01-lesson.md) | Live room renames, mention notifications                            |
| 10  | [Inertia + realtime patterns](10-inertia-realtime/01-lesson.md)        | Prop helpers, optimistic sending, reconnect re-sync                 |
| 11  | [Queues and reliability](11-queues-reliability/01-lesson.md)           | Queued broadcasts, after-commit, failures                           |
| 12  | [Testing](12-testing/01-lesson.md)                                     | Pest tests for events, channels and auth                            |
| 13  | [Production](13-production/01-lesson.md)                               | Reverb config, TLS, scaling, monitoring, deploy                     |
| 99  | [Capstone](99-capstone/01-lesson.md)                                   | Finish the chat: public/private rooms, unread counts, DMs           |

### Project-specific facts the course relies on

These were checked against this project's installed versions. They're easy to get wrong from generic tutorials:

- **`toOthers()` needs an interceptor here.** Echo only auto-sends `X-Socket-ID` with axios/jQuery/Turbo requests, and Inertia v3 has its own HTTP client (module 06 §3).
- **Channel-auth tests pass falsely** under the test suite's `null` broadcaster (module 12 §5).
- **The lerd queue worker listens only on `default`**, so a custom queue needs its own worker (module 11 §7).
- **Reverb runs inside the PHP container on port 8082**, behind lerd's nginx at `/app` and `/apps` (module 05 §4).

## How each module works

Every module folder has four files. Use them in this order:

1. **`01-lesson.md`**: read it with the project open. Code samples show how things work; they aren't a copy-paste checklist.
2. **`02-exercises.md`**: build things. Each exercise ends with **Done when…** so you know you finished. Hints are folded (`<details>`), so open one only when you're stuck.
3. **`03-solutions.md`**: one working answer per exercise. Read it **after** you finish or after 30 minutes stuck. Then compare: different isn't wrong.
4. **`04-checkpoint.md`**: answer the questions without looking. If you can't, re-read that part of the lesson before moving on.

Exercise levels:

- 🟢 **Guided**: the steps are spelled out.
- 🟡 **Open**: the goal is clear; the "how" is up to you.
- 🔴 **Stretch**: optional, goes past the lesson.

## Progress

- [ ] 01 Routing, controllers, Inertia
- [ ] 02 Eloquent
- [ ] 03 Forms and validation
- [ ] 04 Auth by hand
- [ ] 05 Mental model
- [ ] 06 Public channels
- [ ] 07 Private channels
- [ ] 08 Presence
- [ ] 09 Model events and notifications
- [ ] 10 Inertia + realtime patterns
- [ ] 11 Queues and reliability
- [ ] 12 Testing
- [ ] 13 Production
- [ ] 99 Capstone

## Habits that will make you fast

- **Commit after every exercise.** `git commit -m "ex 02.3: seed rooms"`. If you break something, `git diff` shows what changed.
- **Read the error page.** Laravel's error page shows the exact file and line. Read it before searching the web.
- **Use `lerd artisan tinker`** to try queries: `App\Models\Room::with('messages')->first()`.
- **Keep the docs open**: [laravel.com/docs/13.x](https://laravel.com/docs/13.x), [inertiajs.com/docs/v3](https://inertiajs.com/docs/v3).
