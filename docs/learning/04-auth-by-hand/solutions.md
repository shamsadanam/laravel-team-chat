# 04 · Solutions

---

## 04.1 + 04.2 Login, logout, protection

`app/Http/Controllers/Auth/LoginController.php`: as in lesson §3, with these imports:

```php
use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
```

`routes/web.php`:

```php
Route::middleware('guest')->group(function () {
    Route::get('/login', [LoginController::class, 'create'])->name('login');
    Route::post('/login', [LoginController::class, 'store'])->name('login.store');
});

Route::middleware('auth')->group(function () {
    Route::redirect('/', '/rooms')->name('home');
    Route::post('/logout', [LoginController::class, 'destroy'])->name('logout');

    Route::get('/rooms', [RoomController::class, 'index'])->name('rooms.index');
    Route::get('/rooms/create', [RoomController::class, 'create'])->name('rooms.create');
    Route::post('/rooms', [RoomController::class, 'store'])->name('rooms.store');
    Route::get('/rooms/{room:slug}', [RoomController::class, 'show'])->name('rooms.show');

    Route::post('/rooms/{room:slug}/messages', [MessageController::class, 'store'])
        ->name('rooms.messages.store');

    Route::scopeBindings()->group(function () {
        Route::patch('/rooms/{room:slug}/messages/{message}', [MessageController::class, 'update'])
            ->name('rooms.messages.update');
        Route::delete('/rooms/{room:slug}/messages/{message}', [MessageController::class, 'destroy'])
            ->name('rooms.messages.destroy');
    });
});
```

`resources/js/pages/auth/Login.vue`:

```vue
<script setup lang="ts">
import { Form, Head } from '@inertiajs/vue3';
import { store } from '@/actions/App/Http/Controllers/Auth/LoginController';
</script>

<template>
    <Head title="Log in" />
    <div class="flex min-h-screen items-center justify-center">
        <Form
            v-bind="store.form()"
            class="w-80 space-y-3"
            :reset-on-error="['password']"
            #default="{ errors, processing }"
        >
            <h1 class="text-xl font-semibold">Team Chat</h1>
            <div>
                <input name="email" type="email" autocomplete="email" placeholder="Email" class="w-full rounded border p-2" />
                <p v-if="errors.email" class="text-sm text-red-600">{{ errors.email }}</p>
            </div>
            <input name="password" type="password" autocomplete="current-password" placeholder="Password" class="w-full rounded border p-2" />
            <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" name="remember" /> Remember me
            </label>
            <button :disabled="processing" class="w-full rounded border p-2">Log in</button>
        </Form>
    </div>
</template>
```

`:reset-on-error="['password']"` clears only the password after a failure, which is the usual UX.

Layout header:

```vue
<script setup lang="ts">
import { Link, usePage } from '@inertiajs/vue3';
import { logout } from '@/routes';

const page = usePage();
</script>

<template>
    <header class="flex items-center justify-between border-b p-4">
        <span>Team Chat</span>
        <div v-if="page.props.auth.user" class="flex items-center gap-3">
            <span>{{ page.props.auth.user.name }}</span>
            <Link :href="logout()" as="button" class="underline">Log out</Link>
        </div>
    </header>
</template>
```

`resources/js/types/auth.ts`:

```ts
export type Auth = {
    user: User | null;
};
```

---

## 04.3 TEMP removal

```php
$room->messages()->create([
    'user_id' => $request->user()->id,
    'body' => $request->validated('body'),
]);
```

Even better, since the relation exists: `$request->user()->messages()->create(['room_id' => $room->id, …])`. Pick the one that reads most naturally to you.

---

## 04.4 RoomPolicy

```php
class RoomPolicy
{
    public function view(User $user, Room $room): bool
    {
        return $this->isMember($user, $room);
    }

    public function sendMessage(User $user, Room $room): bool
    {
        return $this->isMember($user, $room);
    }

    private function isMember(User $user, Room $room): bool
    {
        return $room->members()->whereKey($user->id)->exists();
    }
}
```

`RoomController@show`:

```php
public function show(Room $room): Response
{
    Gate::authorize('view', $room);
    // …
}
```

`StoreMessageRequest`:

```php
public function authorize(): bool
{
    return $this->user()->can('sendMessage', $this->route('room'));
}
```

Sidebar (shared prop):

```php
'rooms' => fn () => $request->user()?->rooms()
    ->orderBy('name')
    ->get(['rooms.id', 'rooms.name', 'rooms.slug']) ?? [],
```

Note `rooms.id`: the query joins `room_user`, so unqualified column names can be ambiguous.

---

## 04.5 MessagePolicy

```php
class MessagePolicy
{
    public function update(User $user, Message $message): bool
    {
        return $message->user_id === $user->id;
    }

    public function delete(User $user, Message $message): bool
    {
        return $message->user_id === $user->id
            || $message->room->owner_id === $user->id;
    }
}
```

Controller:

```php
public function update(StoreMessageRequest $request, Room $room, Message $message): RedirectResponse
{
    Gate::authorize('update', $message);
    // …
}

public function destroy(Room $room, Message $message): RedirectResponse
{
    Gate::authorize('delete', $message);
    // …
}
```

> `StoreMessageRequest::authorize()` checks `sendMessage` on the room. For `update` that's also true, and the `Gate::authorize('update', …)` adds the author check. When the two rules grow apart, give `update` its own Form Request.

`MessageResource::toArray()`:

```php
'can' => [
    'update' => $request->user()?->can('update', $this->resource) ?? false,
    'delete' => $request->user()?->can('delete', $this->resource) ?? false,
],
```

**Query count:** `delete` reads `$message->room`. With `preventLazyLoading` on, that throws for messages loaded without `room`. In `show`, every message belongs to `$room`, so set the relation without querying:

```php
$messages->each->setRelation('room', $room);
```

Now `delete` costs zero queries per message.

---

## 04.6 Join and leave

```php
// RoomPolicy
public function join(User $user, Room $room): bool
{
    return ! $this->isMember($user, $room);
}

public function leave(User $user, Room $room): bool
{
    return $this->isMember($user, $room) && $room->owner_id !== $user->id;
}
```

```php
class RoomMembershipController extends Controller
{
    public function store(Request $request, Room $room): RedirectResponse
    {
        Gate::authorize('join', $room);

        $room->members()->syncWithoutDetaching([$request->user()->id]);

        return to_route('rooms.show', $room);
    }

    public function destroy(Request $request, Room $room): RedirectResponse
    {
        Gate::authorize('leave', $room);

        $room->members()->detach($request->user()->id);

        return to_route('rooms.index');
    }
}
```

The sidebar updates on its own: the redirect loads a new page, and the shared `rooms` closure runs again.

On the browse page, send `can.join` and `can.leave` per room, as in 04.5. Use `withExists(['members as is_member' => fn ($q) => $q->whereKey($user->id)])` to get membership for all rooms in one query, instead of calling the policy per room.

---

## 04.7 Throttle

In `LoginController::store`, before `Auth::attempt`:

```php
$throttleKey = Str::lower($request->string('email')).'|'.$request->ip();

if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
    throw ValidationException::withMessages([
        'email' => 'Too many attempts. Try again in '.RateLimiter::availableIn($throttleKey).' seconds.',
    ]);
}

if (! Auth::attempt($credentials, $request->boolean('remember'))) {
    RateLimiter::hit($throttleKey, 60);

    throw ValidationException::withMessages([
        'email' => 'These credentials do not match our records.',
    ]);
}

RateLimiter::clear($throttleKey);
```

---

## 04.8 Register

```php
public function store(Request $request): RedirectResponse
{
    $validated = $request->validate([
        'name' => ['required', 'string', 'max:255'],
        'email' => ['required', 'email', 'max:255', 'unique:users,email'],
        'password' => ['required', 'confirmed', Password::defaults()],
    ]);

    $user = User::create($validated);

    Room::where('slug', 'general')->first()?->members()->attach($user);

    Auth::login($user);
    $request->session()->regenerate();

    return to_route('rooms.show', 'general');
}
```

The form needs a `password_confirmation` input for `confirmed`. `User::create` hashes the password through the `hashed` cast.
