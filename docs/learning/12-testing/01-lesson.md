# 12 · Testing realtime features with Pest

**Goal:** prove your realtime features work without opening two browsers: that the right events are dispatched with the right payloads on the right channels, and that only the right people can subscribe.

**You'll touch:** `tests/Feature/`, maybe `tests/Pest.php`.

---

## 1. What you can (and can't) test in PHP

A realtime feature has four layers. Test each where it's cheapest:

| Layer | Question | Tool |
| --- | --- | --- |
| HTTP action | Does POSTing a message save it, authorize, validate, redirect? | Feature test |
| Dispatch | Was `MessagePosted` dispatched, with `toOthers()`? | `Event::fake()` + `assertDispatched` |
| Event shape | Right channel, name, payload, nothing leaked? | Call `broadcastOn()`/`broadcastAs()`/`broadcastWith()` directly |
| Channel auth | Can Grace subscribe to `dev`? | POST `/broadcasting/auth` (with a trap, §5), or the channel class |

What PHP tests **don't** cover: Reverb actually delivering, and Vue handling the event. For that, keep a short manual two-browser checklist, or add browser tests later (`lerd pest:browser install` sets up Pest's browser plugin in this environment).

## 2. Running tests here

```bash
lerd artisan make:test --pest MessageBroadcastingTest --no-interaction
lerd artisan test --compact tests/Feature/MessageBroadcastingTest.php
lerd artisan test --compact --filter="non-members cannot"
```

`phpunit.xml` sets the test environment, and it matters for broadcasting:

| Setting | Value | Consequence |
| --- | --- | --- |
| `DB_CONNECTION` | `sqlite` `:memory:` | Fast; `RefreshDatabase` (in `tests/Pest.php`) migrates per test |
| `QUEUE_CONNECTION` | `sync` | Queued jobs and broadcasts run inline |
| `BROADCAST_CONNECTION` | `null` | Broadcasts go nowhere, so no Reverb is needed. **But see §5.** |

## 3. Asserting dispatch

```php
use App\Events\MessagePosted;
use Illuminate\Support\Facades\Event;

test('posting a message broadcasts it to others', function () {
    $room = Room::factory()->create();
    $ada = User::factory()->create();
    $room->members()->attach($ada);

    Event::fake([MessagePosted::class]);

    $this->actingAs($ada)
        ->withHeader('X-Socket-ID', '123.456')
        ->post(route('rooms.messages.store', $room), ['body' => 'hi'])
        ->assertRedirect();

    Event::assertDispatched(MessagePosted::class, fn (MessagePosted $event) =>
        $event->message->body === 'hi' && $event->socket === '123.456'
    );
});
```

- **Fake only the events you assert on.** `Event::fake()` with no arguments fakes *everything*, including Eloquent model events your factories and model broadcasting may rely on.
- **`$event->socket === '123.456'` proves `toOthers()` was called.** `toOthers()` copies the `X-Socket-ID` header into the event, and Reverb uses it to skip that socket. Without `toOthers()`, `socket` stays `null`.
- Faked events aren't broadcast at all, so no Reverb is needed even with `ShouldBroadcastNow`.

## 4. Testing the event itself

The event's shape is a contract with your Vue code. Test it directly:

```php
test('message posted payload is safe and complete', function () {
    $message = Message::factory()->create();
    $event = new MessagePosted($message);

    expect($event->broadcastOn())->toHaveCount(1)
        ->and($event->broadcastOn()[0]->name)->toBe('presence-rooms.'.$message->room_id)
        ->and($event->broadcastAs())->toBe('message.posted');

    $payload = $event->broadcastWith();

    expect($payload['message'])->toHaveKeys(['id', 'body', 'sent_at', 'author'])
        ->and($payload['message']['author'])->toHaveKeys(['id', 'name'])
        ->and(json_encode($payload))->not->toContain($message->user->email);
});
```

The `email` assertion is a **leak test**. Write one for every event that touches users.

## 5. Testing channel authorization, and the null-driver trap

The obvious test:

```php
$this->actingAs($grace)
    ->post('/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => 'presence-rooms.'.$dev->id])
    ->assertForbidden();   // ❌ fails: the response is 200
```

**It returns 200 for everyone.** Your test environment uses `BROADCAST_CONNECTION=null`, and the null broadcaster's `auth()` doesn't run your callbacks. This was verified against this project's installed framework version. A channel test that passes against the null driver proves nothing.

Two fixes:

**A. Test with a real driver.** Switch to `reverb`, then re-register the channel rules, because they were registered on the null driver at boot:

```php
function useReverbBroadcasting(): void
{
    config(['broadcasting.default' => 'reverb']);
    require base_path('routes/channels.php');
}
```

```php
test('non-members cannot join a room channel', function () {
    useReverbBroadcasting();
    $dev = Room::factory()->create();
    $grace = User::factory()->create();

    $this->actingAs($grace)
        ->post('/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => 'presence-rooms.'.$dev->id])
        ->assertForbidden();
});
```

No network call happens: the reverb driver signs the response locally with the secret.

**B. Test the channel class directly**, as a quick unit-style check:

```php
expect((new RoomChannel)->join($grace, $dev))->toBeFalse();
```

(A) covers the whole path (pattern, binding, middleware, response shape), so use it for the important rules. (B) is fast for edge cases.

## 6. Notifications and policies

```php
Notification::fake();

// …post "@Linus hi" as Ada…

Notification::assertSentTo($linus, MentionedInMessage::class);
Notification::assertNotSentTo($grace, MentionedInMessage::class);   // not a member
```

Policies are plain PHP. Test the rules with a dataset:

```php
test('message deletion rules', function (string $actor, bool $allowed) { … })
    ->with([
        'author' => ['author', true],
        'room owner' => ['owner', true],
        'other member' => ['member', false],
    ]);
```

## 7. Inertia responses

```php
use Inertia\Testing\AssertableInertia as Assert;

$this->actingAs($ada)->get(route('rooms.show', $room))
    ->assertInertia(fn (Assert $page) => $page
        ->component('rooms/Show')
        ->has('messages', 3)
        ->has('messages.0', fn (Assert $m) => $m->hasAll(['id', 'body', 'sent_at', 'author'])->etc())
    );
```

Pair this with the event payload test from §4 and you've tested module 02's promise: **page and socket send the same shape.**

## 8. Common mistakes

| Symptom | Cause |
| --- | --- |
| Channel auth test always passes | Null driver (§5). |
| Factories stop setting attributes after `Event::fake()` | You faked all events. Pass the specific classes. |
| `assertDispatched` fails though the controller broadcasts | The event is dispatched after a failing validation or authorization. Check the response first. |
| Test hits a real Reverb and fails | `ShouldBroadcastNow` with the driver switched to `reverb` and the event not faked. Fake it, or keep `null` for that test. |
| Shape test passes but Vue breaks | You test keys but not nesting/types. Assert the nested `author` keys too. |

## What you should be able to explain now

- Which layer of a realtime feature each test type covers, and what PHP tests can't cover.
- Why to fake specific events, and how to prove `toOthers()` was used.
- Why a channel auth test against the null driver is worthless, and both ways to fix it.
- How a leak test works.

Next: [exercises](02-exercises.md).
