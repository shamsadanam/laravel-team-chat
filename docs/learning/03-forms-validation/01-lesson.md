# 03 · Forms and validation

**Goal:** let users create rooms and post messages, with server-side validation and errors shown in Vue.

**You'll touch:** `app/Http/Requests/`, new controllers, `routes/web.php`, Vue pages.

---

## 1. The write cycle: Post → Redirect → Get

Reading data is `GET → render`. Writing data in Inertia always follows this shape:

```
Vue form ──POST /rooms/general/messages──▶ MessageController@store
                                              │ validate
                                              │ save
                                              ▼
                                       return back()   (302 redirect)
                                              │
Inertia follows the redirect ──GET /rooms/general──▶ RoomController@show
                                              │
                         fresh props (incl. the new message) ──▶ Vue re-renders
```

- **Controllers that write return redirects, not pages.** After a POST, return `back()` or `to_route('rooms.show', $room)`. Never `Inertia::render()` a page from a POST. Refresh would re-submit, and the URL would be wrong.
- Inertia follows the redirect *inside the same XHR flow*, so the user sees no reload. It also keeps component state (like a half-typed draft elsewhere) where it can.
- After `PUT`/`PATCH`/`DELETE`, the Inertia adapter turns a 302 into a **303**, so the follow-up is a GET. You saw this line in `Middleware.php` in 01.7.

> **Why this matters for Reverb:** after the redirect, *the sender's* page has the new message. Nobody else's does. Module 06 fixes that by broadcasting. Keep this split in mind: **HTTP updates the person who acted; WebSockets update everyone else.**

## 2. Validation

### Inline

```php
public function store(Request $request, Room $room): RedirectResponse
{
    $validated = $request->validate([
        'body' => ['required', 'string', 'max:2000'],
    ]);

    // …
}
```

If validation fails, `validate()` **throws**. Laravel stores the errors in the session and redirects back. Inertia exposes them as the `errors` prop, and your form shows them. You write no error-handling code.

### Form Requests

Once rules grow, or you want authorization next to validation, move them into a class:

```bash
lerd artisan make:request StoreMessageRequest --no-interaction
```

```php
class StoreMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;   // module 04 replaces this with a real check
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'body' => ['required', 'string', 'max:2000'],
        ];
    }
}
```

```php
public function store(StoreMessageRequest $request, Room $room): RedirectResponse
{
    $room->messages()->create([
        'user_id' => …,
        'body' => $request->validated('body'),
    ]);

    return back();
}
```

When the controller method runs, the data is already valid. Use `validated()`, never `all()`: it returns *only* fields that have rules.

### Normalising input before validation

A room's `slug` comes from its name. Derive it before the rules run, so the `unique` rule checks the real value:

```php
protected function prepareForValidation(): void
{
    $this->merge(['slug' => Str::slug((string) $this->input('name'))]);
}

public function rules(): array
{
    return [
        'name' => ['required', 'string', 'min:2', 'max:40'],
        'slug' => ['required', 'unique:rooms,slug'],
        'description' => ['nullable', 'string', 'max:200'],
    ];
}
```

### Rule reference you'll use constantly

| Rule | Meaning |
| --- | --- |
| `required` / `nullable` / `sometimes` | must be present / may be null / only validate if present |
| `string`, `integer`, `boolean`, `array` | type |
| `min:x`, `max:x` | length for strings, size for numbers |
| `email`, `url`, `uuid` | format |
| `unique:table,column` | not already in the database. Use `Rule::unique(…)->ignore($id)` on updates |
| `exists:table,column` | must exist (e.g. a `room_id` you were sent) |
| `in:a,b,c` / `Rule::enum(Status::class)` | allowed values |

## 3. CSRF, handled for you

Every POST/PUT/PATCH/DELETE in the `web` middleware group must carry a valid CSRF token, which proves the request came from your site and not a malicious one. Laravel sets an `XSRF-TOKEN` cookie; Inertia's HTTP client reads it and sends it back as a header automatically.

You only notice CSRF when it fails: a **419 Page Expired** response. Usually the session expired or the cookie domain is wrong.

## 4. Inertia forms: two tools

### `<Form>`: declarative, like plain HTML

```vue
<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { store } from '@/actions/App/Http/Controllers/RoomController';
</script>

<template>
    <Form v-bind="store.form()" reset-on-success #default="{ errors, processing }">
        <input name="name" />
        <p v-if="errors.name" class="text-red-600">{{ errors.name }}</p>

        <textarea name="description" />
        <p v-if="errors.description" class="text-red-600">{{ errors.description }}</p>

        <button :disabled="processing">Create</button>
    </Form>
</template>
```

- Inputs need only a `name`, no `v-model`.
- `store.form()` comes from Wayfinder and gives `{ action, method }`. The `formVariants: true` option in `vite.config.ts` enables it.
- Slot props: `errors`, `processing`, `wasSuccessful`, `recentlySuccessful`, `reset`, `isDirty`, `submit`, …

### `useForm`: programmatic control

Use it when you need the values in script, such as a chat composer that sends on Enter:

```vue
<script setup lang="ts">
import { useForm } from '@inertiajs/vue3';
import { store } from '@/actions/App/Http/Controllers/MessageController';

const props = defineProps<{ room: { slug: string } }>();

const form = useForm({ body: '' });

function send(): void {
    form.post(store.url(props.room.slug), {
        preserveScroll: true,
        onSuccess: () => form.reset('body'),
    });
}
</script>

<template>
    <form @submit.prevent="send">
        <textarea v-model="form.body" @keydown.enter.exact.prevent="send" />
        <p v-if="form.errors.body">{{ form.errors.body }}</p>
        <button :disabled="form.processing">Send</button>
    </form>
</template>
```

`form.submit(store(props.room.slug), { … })` also works: it takes the method and URL from the Wayfinder object.

**Rule of thumb:** use `<Form>` by default, and `useForm` when your script needs the data.

## 5. Nested routes

A message belongs to a room, so its URL says so:

```php
Route::post('/rooms/{room:slug}/messages', [MessageController::class, 'store'])
    ->name('rooms.messages.store');
```

Wayfinder: `store.url(room.slug)` → `/rooms/general/messages`.

## 6. Flash data: one-time messages

"Room created!" should show once, then disappear. Inertia v3 has **flash data** for that:

```php
Inertia::flash('toast', ['type' => 'success', 'message' => 'Room created']);

return to_route('rooms.show', $room);
```

```vue
<script setup lang="ts">
import { usePage } from '@inertiajs/vue3';

const page = usePage();
</script>

<template>
    <div v-if="page.flash.toast">{{ page.flash.toast.message }}</div>
</template>
```

Flash data isn't stored in browser history, so pressing Back doesn't bring the toast back. Type it with `flashDataType` in `resources/js/types/global.d.ts` (see Inertia's TypeScript docs).

## 7. Before auth exists: a temporary author

Messages need a `user_id`, but login arrives in module 04. Until then, use a clearly marked stand-in:

```php
// TEMP(module 04): replace with $request->user()
$author = User::where('email', 'ada@example.com')->firstOrFail();
```

Search for `TEMP(module 04)` when you get there.

## 8. Common mistakes

| Symptom | Cause |
| --- | --- |
| Errors never show | You returned `Inertia::render()` from the POST, or caught the `ValidationException` yourself. |
| **419** | CSRF/session problem: expired session, cookie domain, or the request isn't going through the `web` group. |
| The input keeps its text after a successful send | Add `reset-on-success` to `<Form>`, or `onSuccess: () => form.reset('body')` with `useForm`. |
| `unique` passes but saving fails on duplicate slug | You validated `name` but saved a slug derived *after* validation. Use `prepareForValidation`. |
| Page jumps to top after sending | Add `preserveScroll: true`. |
| Saved data includes fields you didn't expect | You used `$request->all()` instead of `validated()`. |

## What you should be able to explain now

- Why write endpoints redirect instead of rendering.
- What happens, step by step, when validation fails.
- When to use a Form Request vs inline `validate()`.
- `<Form>` vs `useForm`: when you'd pick each.
- Why HTTP alone can't update *other* users' screens.

Next: [exercises](02-exercises.md).
