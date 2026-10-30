# 09 · Solutions

---

## 09.1 Rename live

`Room`:

```php
use Illuminate\Broadcasting\Channel;
use Illuminate\Database\Eloquent\BroadcastsEvents;

class Room extends Model
{
    use BroadcastsEvents, HasFactory;

    /**
     * @return array<int, Channel|Model>
     */
    public function broadcastOn(string $event): array
    {
        return match ($event) {
            'updated', 'deleted' => [$this],
            default => [],
        };
    }

    /**
     * @return array{model: array<string, mixed>}
     */
    public function broadcastWith(string $event): array
    {
        return ['model' => $this->only('id', 'name', 'slug', 'description')];
    }
}
```

`routes/channels.php`:

```php
Broadcast::channel('App.Models.Room.{room}', RoomChannel::class);
```

(For a private model channel, `RoomChannel::join`'s array return is truthy, so it works unchanged.)

Room page:

```ts
const room = ref({ ...props.room });

watch(() => props.room, (fresh) => (room.value = { ...fresh }));

useEchoModel<Pick<Room, 'id' | 'name' | 'slug' | 'description'>, 'App.Models.Room'>(
    'App.Models.Room',
    props.room.id,
    ['.RoomUpdated'],
    (e) => (room.value = { ...room.value, ...e.model }),
);
```

**Slug decision (recommended):** keep slugs stable on rename. URLs and bookmarks keep working, and a rename is a display change.

---

## 09.2 Sidebar

Model broadcasting goes to the *room's* channel, and the layout isn't subscribed there (and shouldn't subscribe to N room channels). The audience is "every member, wherever they are", so it's an **explicit event to each member's user channel**:

```php
// RoomController@update
$room->update($request->validated());

foreach ($room->members()->pluck('users.id') as $memberId) {
    broadcast(new RoomMembershipChanged($memberId, $room->id, 'renamed'));
}
```

(Widen the `action` type to include `'renamed'`, or create a dedicated `SidebarChanged` event.) The 07.4 listener already does `router.reload({ only: ['rooms'] })`.

For rooms with thousands of members, a loop of broadcasts is too much; module 11 covers queueing it. That's also when "reload the sidebar on focus" starts to look attractive.

---

## 09.3 Mentions

```php
class MentionedInMessage extends Notification
{
    use Queueable;

    public function __construct(public Message $message) {}

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database', 'broadcast'];
    }

    /**
     * @return array{message_id: int, room: array<string, mixed>, by: array<string, mixed>, excerpt: string}
     */
    public function toArray(object $notifiable): array
    {
        $this->message->loadMissing('room', 'user');

        return [
            'message_id' => $this->message->id,
            'room' => $this->message->room->only('id', 'name', 'slug'),
            'by' => $this->message->user->only('id', 'name'),
            'excerpt' => Str::limit($this->message->body, 80),
        ];
    }
}
```

Controller:

```php
preg_match_all('/@(\w+)/', $message->body, $matches);

if ($matches[1] !== []) {
    $mentioned = $room->members()
        ->whereIn('name', array_unique($matches[1]))
        ->whereKeyNot($request->user()->id)
        ->get();

    Notification::send($mentioned, new MentionedInMessage($message));
}
```

Shared prop:

```php
'notifications' => fn () => $request->user()
    ? ['unread' => $request->user()->unreadNotifications()->count()]
    : null,
```

Layout listener (inside the logged-in-only child component):

```ts
const unread = ref(page.props.notifications?.unread ?? 0);

watch(() => page.props.notifications?.unread, (fresh) => (unread.value = fresh ?? 0));

useEchoNotification<MentionPayload>(
    `App.Models.User.${page.props.auth.user!.id}`,
    () => unread.value++,
    'App.Notifications.MentionedInMessage',
);
```

Remember to add `notifications` to `sharedPageProps` in `global.d.ts`.

---

## 09.4 Menu

Optional prop in `HandleInertiaRequests::share()`:

```php
'notificationList' => Inertia::optional(fn () => $request->user()?->notifications()->latest()->take(10)->get()
    ->map(fn ($n) => ['id' => $n->id, 'data' => $n->data, 'read' => $n->read_at !== null, 'created_at' => $n->created_at->toIso8601String()])),
```

Open the dropdown → `router.reload({ only: ['notificationList'] })`.

Routes:

```php
Route::post('/notifications/{notification}/read', function (Request $request, string $notification) {
    $request->user()->notifications()->findOrFail($notification)->markAsRead();

    return back();
})->name('notifications.read');

Route::post('/notifications/read-all', function (Request $request) {
    $request->user()->unreadNotifications()->update(['read_at' => now()]);

    return back();
})->name('notifications.read-all');
```

`$request->user()->notifications()->findOrFail(…)` scopes the lookup to the current user, so you can't mark someone else's.

Live arrivals with the dropdown open: in the `useEchoNotification` callback, `unshift` the payload into the local list.

**Other tab:** the simple, honest choice is to accept drift until the next navigation, since the count is corrected on every page load. If it matters, broadcast `notifications.read` on the user channel and reload `notifications` in every tab.

---

## 09.5 `touch()` gotcha

`touch()` saves `updated_at`, which fires `updated`, so Linus receives a `RoomUpdated` with unchanged data. Harmless here, but on busy models it's noise and wasted work.

```php
public function broadcastOn(string $event): array
{
    return match (true) {
        $event === 'deleted' => [$this],
        $event === 'updated' && $this->wasChanged(['name', 'description']) => [$this],
        default => [],
    };
}
```

---

## 09.6 Custom channel name

```php
// User
public function receivesBroadcastNotificationsOn(): string
{
    return 'users.'.$this->id;
}
```

```php
Broadcast::channel('users.{id}', fn (User $user, int $id) => $user->id === $id);
```

Change `RoomMembershipChanged` to `new PrivateChannel('users.'.$this->userId)`, and every client to `` `users.${id}` ``.

**Why rename:** a shorter, stable name that doesn't leak your PHP namespace to the client, and doesn't break if you ever move or rename the `User` class.
