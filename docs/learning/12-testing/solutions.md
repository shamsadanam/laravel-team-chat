# 12 · Solutions

Assumes factories `RoomFactory` and `MessageFactory` from module 02, and route names from modules 03–04.

---

## Shared helpers (`tests/Pest.php`)

```php
use App\Models\Room;
use App\Models\User;

function useReverbBroadcasting(): void
{
    config(['broadcasting.default' => 'reverb']);
    require base_path('routes/channels.php');
}

/**
 * @return array{0: Room, 1: User}
 */
function roomWithMember(): array
{
    $member = User::factory()->create();
    $room = Room::factory()->for($member, 'owner')->create();
    $room->members()->attach($member);

    return [$room, $member];
}
```

---

## 12.1 Sending

```php
test('a member can post a message', function () {
    [$room, $ada] = roomWithMember();

    $this->actingAs($ada)
        ->post(route('rooms.messages.store', $room), ['body' => 'hello'])
        ->assertRedirect();

    expect($room->messages()->sole()->body)->toBe('hello');
});

test('an empty body is rejected', function () {
    [$room, $ada] = roomWithMember();

    $this->actingAs($ada)
        ->post(route('rooms.messages.store', $room), ['body' => ''])
        ->assertSessionHasErrors('body');

    expect($room->messages()->count())->toBe(0);
});

test('non-members cannot post', function () {
    [$room] = roomWithMember();

    $this->actingAs(User::factory()->create())
        ->post(route('rooms.messages.store', $room), ['body' => 'sneaky'])
        ->assertForbidden();

    expect($room->messages()->count())->toBe(0);
});

test('guests are redirected to login', function () {
    [$room] = roomWithMember();

    $this->post(route('rooms.messages.store', $room), ['body' => 'hi'])
        ->assertRedirect(route('login'));
});
```

---

## 12.2 Dispatch

```php
use App\Events\MessageDeleted;
use App\Events\MessagePosted;
use App\Events\MessageUpdated;
use Illuminate\Support\Facades\Event;

beforeEach(fn () => Event::fake([MessagePosted::class, MessageUpdated::class, MessageDeleted::class]));

test('posting broadcasts to others', function () {
    [$room, $ada] = roomWithMember();

    $this->actingAs($ada)
        ->withHeader('X-Socket-ID', '123.456')
        ->post(route('rooms.messages.store', $room), ['body' => 'hi']);

    Event::assertDispatched(MessagePosted::class, fn (MessagePosted $e) =>
        $e->message->body === 'hi' && $e->socket === '123.456'
    );
});

test('deleting broadcasts the ids', function () {
    [$room, $ada] = roomWithMember();
    $message = Message::factory()->for($room)->for($ada)->create();

    $this->actingAs($ada)->delete(route('rooms.messages.destroy', [$room, $message]));

    Event::assertDispatched(MessageDeleted::class, fn (MessageDeleted $e) =>
        $e->roomId === $room->id && $e->messageId === $message->id
    );
});

test('invalid messages broadcast nothing', function () {
    [$room, $ada] = roomWithMember();

    $this->actingAs($ada)->post(route('rooms.messages.store', $room), ['body' => '']);

    Event::assertNotDispatched(MessagePosted::class);
});
```

(Update test: same shape as delete, asserting `MessageUpdated` and the new body.)

`beforeEach` runs **after** `RefreshDatabase`, but before the factories in each test. Faking only these three classes leaves Eloquent's own events alone, so factories behave normally.

---

## 12.3 Shape and leaks

```php
test('message posted has a safe, complete payload', function () {
    $message = Message::factory()->create();
    $event = new MessagePosted($message);

    expect($event->broadcastOn()[0]->name)->toBe('presence-rooms.'.$message->room_id)
        ->and($event->broadcastAs())->toBe('message.posted');

    $payload = $event->broadcastWith();

    expect($payload['message'])->toHaveKeys(['id', 'body', 'sent_at', 'author'])
        ->and($payload['message']['author'])->toBe(['id' => $message->user->id, 'name' => $message->user->name])
        ->and(json_encode($payload))->not->toContain($message->user->email);
});
```

Remove `broadcastWith()` → the payload becomes the serialized model (or the test fails on the missing `message.author` key), and the email check fails.

---

## 12.4 Channel auth

```php
beforeEach(fn () => useReverbBroadcasting());

function joinRoom(Room $room): array
{
    return ['socket_id' => '1.1', 'channel_name' => 'presence-rooms.'.$room->id];
}

test('members can join and expose only id and name', function () {
    [$room, $ada] = roomWithMember();

    $response = $this->actingAs($ada)->post('/broadcasting/auth', joinRoom($room))->assertOk();

    $data = json_decode($response->json('channel_data'), true);

    expect($data['user_info'])->toBe(['id' => $ada->id, 'name' => $ada->name]);
});

test('non-members cannot join', function () {
    [$room] = roomWithMember();

    $this->actingAs(User::factory()->create())->post('/broadcasting/auth', joinRoom($room))->assertForbidden();
});

test('guests cannot join', function () {
    [$room] = roomWithMember();

    $this->post('/broadcasting/auth', joinRoom($room))->assertForbidden();
});

test('missing rooms deny', function () {
    $this->actingAs(User::factory()->create())
        ->post('/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => 'presence-rooms.999'])
        ->assertForbidden();
});

test('users cannot listen to other users', function () {
    [$ada, $linus] = User::factory()->count(2)->create();

    $this->actingAs($ada)
        ->post('/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => 'private-App.Models.User.'.$linus->id])
        ->assertForbidden();
});
```

If the guest test returns a redirect instead of 403 in your setup, check how unauthenticated requests to `/broadcasting/auth` are handled. Either response is a denial, but pin down the one you get and assert exactly that.

---

## 12.5 Mentions

```php
use Illuminate\Support\Facades\Notification;

beforeEach(fn () => Notification::fake());

test('members are notified once when mentioned', function () {
    [$room, $ada] = roomWithMember();
    $linus = User::factory()->create(['name' => 'Linus']);
    $room->members()->attach($linus);

    $this->actingAs($ada)->post(route('rooms.messages.store', $room), ['body' => '@Linus @Linus lunch?']);

    Notification::assertSentToTimes($linus, MentionedInMessage::class, 1);
    Notification::assertSentTo($linus, MentionedInMessage::class, fn ($n) =>
        $n->toArray($linus)['excerpt'] === '@Linus @Linus lunch?'
    );
});

test('non-members and self are never notified', function () {
    [$room, $ada] = roomWithMember();
    $grace = User::factory()->create(['name' => 'Grace']);

    $this->actingAs($ada)->post(route('rooms.messages.store', $room), ['body' => "@Grace @{$ada->name}"]);

    Notification::assertNothingSent();
});
```

Factory names like "Ada Lovelace" contain spaces, so force single-word names in these tests, as above.

---

## 12.6 Same shape

```php
test('page and socket deliver the same message shape', function () {
    [$room, $ada] = roomWithMember();
    $message = Message::factory()->for($room)->for($ada)->create();

    $fromPage = $this->actingAs($ada)->get(route('rooms.show', $room))->inertiaProps('messages.0');
    $fromSocket = (new MessagePosted($message))->broadcastWith()['message'];

    expect($fromSocket)->toEqual($fromPage);
});
```

If `inertiaProps()` isn't available in your version, use `$response->viewData('page')['props']['messages'][0]`.

---

## 12.7 After-commit

Make the failure toggleable from the test. For example, create the room in a service method that accepts a callback, or collide on the unique slug:

```php
test('room created is not broadcast when the transaction rolls back', function () {
    Event::fake([RoomCreated::class]);
    $ada = User::factory()->create();
    Room::factory()->create(['slug' => 'taken']);

    expect(fn () => DB::transaction(function () use ($ada) {
        $room = Room::create(['name' => 'Fresh', 'slug' => 'fresh', 'owner_id' => $ada->id]);
        broadcast(new RoomCreated($room, $ada->id));
        Room::create(['name' => 'Taken', 'slug' => 'taken', 'owner_id' => $ada->id]); // unique violation
    }))->toThrow(QueryException::class);

    Event::assertNotDispatched(RoomCreated::class);
});

test('room created is broadcast once on commit', function () {
    Event::fake([RoomCreated::class]);
    $ada = User::factory()->create();

    DB::transaction(function () use ($ada) {
        $room = Room::create(['name' => 'Fresh', 'slug' => 'fresh', 'owner_id' => $ada->id]);
        broadcast(new RoomCreated($room, $ada->id));
    });

    Event::assertDispatchedOnce(RoomCreated::class);
});
```

`RefreshDatabase` wraps each test in a transaction, and Laravel's testing support treats that wrapper as the baseline. Your `DB::transaction` inside still commits or rolls back as a nested transaction for after-commit purposes. Remove `ShouldDispatchAfterCommit` and the first test fails.
