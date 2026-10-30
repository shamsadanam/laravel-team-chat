# 03 · Solutions

---

## 03.1 + 03.2 Post a message

`app/Http/Requests/StoreMessageRequest.php`:

```php
class StoreMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
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

`app/Http/Controllers/MessageController.php`:

```php
class MessageController extends Controller
{
    public function store(StoreMessageRequest $request, Room $room): RedirectResponse
    {
        // TEMP(module 04): replace with $request->user()
        $author = User::where('email', 'ada@example.com')->firstOrFail();

        $room->messages()->create([
            'user_id' => $author->id,
            'body' => $request->validated('body'),
        ]);

        return back();
    }
}
```

Route:

```php
Route::post('/rooms/{room:slug}/messages', [MessageController::class, 'store'])
    ->name('rooms.messages.store');
```

**03.2 whitespace:** no code needed. `TrimStrings` turns `"   "` into `""`, then `ConvertEmptyStringsToNull` turns it into `null`, which fails `required`. Both middleware are in Laravel's default global stack.

---

## 03.3 Composer

```vue
<script setup lang="ts">
import { useForm } from '@inertiajs/vue3';
import { store } from '@/actions/App/Http/Controllers/MessageController';

const props = defineProps<{ room: { slug: string } }>();

const form = useForm({ body: '' });

function send(): void {
    if (form.processing || form.body.trim() === '') {
        return;
    }

    form.post(store.url(props.room.slug), {
        preserveScroll: true,
        onSuccess: () => form.reset('body'),
    });
}
</script>

<template>
    <form class="mt-4 flex gap-2" @submit.prevent="send">
        <textarea
            v-model="form.body"
            rows="2"
            class="flex-1 rounded border p-2"
            placeholder="Message…"
            @keydown.enter.exact.prevent="send"
        />
        <button
            class="rounded border px-4"
            :disabled="form.processing || form.body.trim() === ''"
        >
            Send
        </button>
    </form>
    <p v-if="form.errors.body" class="text-sm text-red-600">{{ form.errors.body }}</p>
</template>
```

Holding Enter is safe because `processing` stays `true` until the visit finishes. In Inertia v3 it resets only in `onFinish`.

---

## 03.4 Create a room

`app/Http/Requests/StoreRoomRequest.php`:

```php
class StoreRoomRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['slug' => Str::slug((string) $this->input('name'))]);
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:40'],
            'slug' => ['required', 'unique:rooms,slug'],
            'description' => ['nullable', 'string', 'max:200'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'slug.unique' => 'A room with this name already exists.',
            'slug.required' => 'The name must contain letters or numbers.',
        ];
    }
}
```

`slug.required` catches a name like `"!!"`, whose slug is empty.

`RoomController`:

```php
public function create(): Response
{
    return Inertia::render('rooms/Create');
}

public function store(StoreRoomRequest $request): RedirectResponse
{
    // TEMP(module 04): replace with $request->user()
    $author = User::where('email', 'ada@example.com')->firstOrFail();

    $room = Room::create([...$request->validated(), 'owner_id' => $author->id]);
    $room->members()->attach($author);

    return to_route('rooms.show', $room);
}
```

`to_route('rooms.show', $room)` works with `{room:slug}`: Laravel takes the slug from the model because the route says so.

Routes. `create` must come **before** `{room:slug}`, or `/rooms/create` is treated as a room called "create":

```php
Route::get('/rooms', [RoomController::class, 'index'])->name('rooms.index');
Route::get('/rooms/create', [RoomController::class, 'create'])->name('rooms.create');
Route::post('/rooms', [RoomController::class, 'store'])->name('rooms.store');
Route::get('/rooms/{room:slug}', [RoomController::class, 'show'])->name('rooms.show');
```

`resources/js/pages/rooms/Create.vue`:

```vue
<script setup lang="ts">
import { Form, Head } from '@inertiajs/vue3';
import { store } from '@/actions/App/Http/Controllers/RoomController';
import AppLayout from '@/layouts/AppLayout.vue';

defineOptions({ layout: AppLayout });
</script>

<template>
    <Head title="New room" />
    <Form v-bind="store.form()" class="max-w-md space-y-3" #default="{ errors, processing }">
        <div>
            <input name="name" placeholder="Room name" class="w-full rounded border p-2" />
            <p v-if="errors.name || errors.slug" class="text-sm text-red-600">
                {{ errors.name ?? errors.slug }}
            </p>
        </div>
        <div>
            <textarea name="description" placeholder="What's it for?" class="w-full rounded border p-2" />
            <p v-if="errors.description" class="text-sm text-red-600">{{ errors.description }}</p>
        </div>
        <button :disabled="processing" class="rounded border px-4 py-2">Create</button>
    </Form>
</template>
```

---

## 03.5 Toast

Controller:

```php
Inertia::flash('toast', ['type' => 'success', 'message' => 'Room created']);

return to_route('rooms.show', $room);
```

`resources/js/types/global.d.ts`, inside `InertiaConfig`:

```ts
flashDataType: {
    toast?: { type: 'success' | 'error'; message: string };
};
```

`AppLayout.vue`:

```ts
import { usePage } from '@inertiajs/vue3';
import { ref, watch } from 'vue';

const page = usePage();
const toast = ref<{ type: string; message: string } | null>(null);
let hideTimer: ReturnType<typeof setTimeout> | undefined;

watch(
    () => page.flash.toast,
    (incoming) => {
        if (!incoming) {
            return;
        }

        toast.value = incoming;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => (toast.value = null), 3000);
    },
);
```

```vue
<div v-if="toast" class="fixed right-4 bottom-4 rounded border bg-white p-3 shadow dark:bg-neutral-900">
    {{ toast.message }}
</div>
```

---

## 03.6 Edit and delete

Routes:

```php
Route::scopeBindings()->group(function () {
    Route::patch('/rooms/{room:slug}/messages/{message}', [MessageController::class, 'update'])
        ->name('rooms.messages.update');
    Route::delete('/rooms/{room:slug}/messages/{message}', [MessageController::class, 'destroy'])
        ->name('rooms.messages.destroy');
});
```

Controller:

```php
public function update(StoreMessageRequest $request, Room $room, Message $message): RedirectResponse
{
    $message->update(['body' => $request->validated('body')]);

    return back();
}

public function destroy(Room $room, Message $message): RedirectResponse
{
    $message->delete();

    return back();
}
```

> Reusing `StoreMessageRequest` for updates is fine while the rules are identical. Split it when they differ.

Without `scopeBindings`, `{message}` is looked up globally, and `/rooms/general/messages/{dev message id}` would edit a message in `dev`. With it, Laravel uses `$room->messages()` to resolve it and returns a 404.

UI check for now: the page needs to know who "you" are, so pass `currentUserId` from the controller (TEMP), and show the buttons when `message.author.id === currentUserId`. **This is not security.** Anyone can still send the request. Module 04 adds a policy.

---

## 03.7 Precognition

Route:

```php
use Illuminate\Foundation\Http\Middleware\HandlePrecognitiveRequests;

Route::post('/rooms', [RoomController::class, 'store'])
    ->middleware(HandlePrecognitiveRequests::class)
    ->name('rooms.store');
```

Form:

```vue
<Form v-bind="store.form()" #default="{ errors, processing, invalid, validate, validating }">
    <input name="name" @change="validate('name')" />
    <p v-if="invalid('name') || errors.slug">{{ errors.name ?? errors.slug }}</p>
    <p v-if="validating" class="text-xs opacity-60">Checking…</p>
    …
</Form>
```

Validating `name` alone may not surface the `slug.unique` error, because the slug is a separate key. If so, validate both: `validate({ only: ['name', 'slug'] })`. This is a good example of server-side normalisation interacting with client-side field names. Notice it and decide.
