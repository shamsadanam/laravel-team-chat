# 04 · Auth by hand

**Goal:** build login and logout yourself, protect routes, and decide *who may do what* with policies. This module is the foundation for private channels: in module 07, Reverb asks Laravel "may this user listen to room X?", and the answer comes from the code you write here.

**You'll touch:** `app/Http/Controllers/Auth/`, `routes/web.php`, `app/Policies/`, `HandleInertiaRequests`, Vue pages.

---

## 1. Two different questions

| | Question | Laravel tool | Failure |
| --- | --- | --- | --- |
| **Authentication** | *Who are you?* | `Auth`, guards, sessions, the `auth` middleware | redirect to login (or 401) |
| **Authorization** | *Are you allowed to do this?* | Gates, Policies, `can` | 403 Forbidden |

Keep them separate in your head. "Logged in" never means "allowed".

## 2. How a login persists

HTTP is stateless (module 01), so how does the second request know you logged in?

```
POST /login (email, password)
   │  Auth::attempt() → finds user, checks the password hash
   │  stores the user id in the session
   ▼
Response sets a cookie:  laravel_session=abc123  (encrypted, HttpOnly)
   │
GET /rooms  (browser sends the cookie automatically)
   │  StartSession middleware → loads session abc123 from the `sessions` table
   │  $request->user() → reads the user id from the session → loads the User
```

- Your `.env` has `SESSION_DRIVER=database`, so sessions live in the `sessions` table. Look at it with `lerd artisan db:table sessions`, or query it after logging in.
- The **guard** (`web`, in `config/auth.php`) is the "how do we identify users" strategy: session-based for browsers.

> **Why this matters for Reverb:** when Echo subscribes to a private channel, it POSTs to `/broadcasting/auth`. That route is in the `web` group, so the browser sends the **same session cookie**, and `$request->user()` works the same way as on your pages. No tokens or extra setup. If login works in your app, it works for Reverb.

## 3. The login controller

```php
class LoginController extends Controller
{
    public function create(): Response
    {
        return Inertia::render('auth/Login');
    }

    public function store(Request $request): RedirectResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($credentials, $request->boolean('remember'))) {
            throw ValidationException::withMessages([
                'email' => 'These credentials do not match our records.',
            ]);
        }

        $request->session()->regenerate();

        return redirect()->intended(route('rooms.index'));
    }

    public function destroy(Request $request): RedirectResponse
    {
        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return to_route('login');
    }
}
```

Every line is there for a reason:

- **`Auth::attempt()`** finds the user by `email` and compares the hashed password. Never hash the input yourself. The `User` model's `'password' => 'hashed'` cast hashes on save.
- **The error goes on `email`, not `password`,** and doesn't say which one was wrong, so attackers can't learn which emails exist.
- **`regenerate()`** gives the session a new id after login. This prevents *session fixation*, where an attacker plants a known session id before you log in.
- **`intended()`** sends the user back to the page they originally asked for (stored by the `auth` middleware), or falls back to the rooms list.
- **On logout**, `invalidate()` destroys the session data and `regenerateToken()` issues a fresh CSRF token.

## 4. Protecting routes with middleware

```php
Route::middleware('guest')->group(function () {
    Route::get('/login', [LoginController::class, 'create'])->name('login');
    Route::post('/login', [LoginController::class, 'store']);
});

Route::middleware('auth')->group(function () {
    Route::post('/logout', [LoginController::class, 'destroy'])->name('logout');

    Route::get('/rooms', …);
    // …every chat route
});
```

- `auth`: not logged in → redirect to the route **named `login`**. That's why the name matters. Change the target with `$middleware->redirectGuestsTo(...)` in `bootstrap/app.php`.
- `guest`: already logged in → redirect away from the login page.

## 5. Sharing the user with Vue

`HandleInertiaRequests` already shares `auth.user`. Two things to tighten:

```php
'auth' => [
    'user' => $request->user()?->only('id', 'name', 'email'),
],
```

- `#[Hidden(['password', 'remember_token'])]` on `User` already keeps secrets out. Still, sending only the fields you need is a good habit (module 01).
- `auth.user` is `null` for guests. The `Auth` type in `resources/js/types/auth.ts` says `user: User`. Make it `User | null` so TypeScript forces you to handle guests.

## 6. Authorization: Gates and Policies

### Gates: one-off checks

```php
// AppServiceProvider::boot()
Gate::define('create-room', fn (User $user) => $user->email_verified_at !== null);
```

### Policies: rules about a model

```bash
lerd artisan make:policy RoomPolicy --model=Room --no-interaction
```

```php
class RoomPolicy
{
    public function view(User $user, Room $room): bool
    {
        return $room->members()->whereKey($user->id)->exists();
    }
}
```

Laravel finds `RoomPolicy` for `Room` automatically by naming convention (`App\Models\Room` → `App\Policies\RoomPolicy`). You don't register anything.

Ways to check it:

```php
// In a controller (throws a 403 on failure)
Gate::authorize('view', $room);

// As boolean
$request->user()->can('view', $room);

// As route middleware
Route::get('/rooms/{room:slug}', …)->can('view', 'room');

// In a Form Request
public function authorize(): bool
{
    return $this->user()->can('sendMessage', $this->route('room'));
}
```

> The base `Controller` in this project is empty, so `$this->authorize()` isn't available. Use `Gate::authorize()`. That's the Laravel 11+ default.

### Telling the UI what's allowed

Authorization always happens on the server. But the UI should hide buttons the user can't use. Send booleans along with the data:

```php
'can' => [
    'update' => $request->user()->can('update', $message),
    'delete' => $request->user()->can('delete', $message),
],
```

```vue
<button v-if="message.can.update">Edit</button>
```

Hiding a button is **UX, not security**. The policy check in the controller is the security.

## 7. Preview: this is exactly what private channels use

In module 07 you'll write this in `routes/channels.php`:

```php
Broadcast::channel('rooms.{room}', function (User $user, Room $room) {
    return $user->can('view', $room);
});
```

The same `RoomPolicy::view`, the same session, the same `User`. Getting policies right now means private channels are just a few lines later.

## 8. Testing logins by hand: two browsers

From module 06 on you'll need **two users at once**. Use a normal window for Ada and a private/incognito window (separate cookies) for Linus. Seeded password: `password`.

## 9. Common mistakes

| Symptom | Cause |
| --- | --- |
| `Route [login] not defined` | The `auth` middleware redirects to a route named `login`. Name it. |
| Login "works" but the next page says guest | The session isn't persisting: check `SESSION_DOMAIN` and `APP_URL` (https vs http), or the `sessions` table is missing. |
| Always "credentials do not match" | The password in the database isn't hashed (you inserted it raw), or you hashed the input before `attempt()`. |
| 403 everywhere after adding the policy | The current user isn't a member. Check the seeder, or `$room->members` in tinker. |
| `Call to undefined method authorize()` | The base `Controller` has no `AuthorizesRequests`. Use `Gate::authorize()`. |
| Logged-out user still sees the old name | You shared a **once** prop for `auth` without returning `null` for guests (see the Inertia once-props docs). The plain share in §5 doesn't have this problem. |

## What you should be able to explain now

- Authentication vs authorization, and which HTTP status each fails with.
- How the session cookie turns into `$request->user()` on the next request.
- Why `regenerate()` on login and `invalidate()` plus `regenerateToken()` on logout.
- How a policy is found, and four places you can check it.
- Why hiding a button isn't authorization.
- Why `/broadcasting/auth` "just works" with your login.

Next: [exercises](exercises.md).
