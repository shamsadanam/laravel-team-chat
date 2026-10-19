# Laravel Reverb for beginners

## 1. The problem Reverb solves

A normal web page works like a phone call that hangs up after every sentence. The browser asks, the server answers, and the connection closes. The server has no way to contact the browser later to say "a new message arrived". The browser would have to keep asking ("anything new? anything new?"), which is slow and wasteful.

A **WebSocket** is a phone line that stays open. Once it's connected, either side can talk at any time.

**Reverb** is a WebSocket server written in PHP and made by the Laravel team. Its only job is to keep those open lines to browsers and pass messages along to them.

## 2. The four pieces

```
 Your Laravel app            Reverb server             Browser
 (PHP, handles requests)     (long-running process)    (Laravel Echo in JS)
        │                          │                          │
        │  1. event(new X)         │                          │
        │ ───── HTTP POST ───────▶ │                          │
        │                          │  2. push over WebSocket  │
        │                          │ ───────────────────────▶ │  3. your JS callback runs
```

| Piece       | What it is                                                     | Where it is in your project                                |
| ----------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| **Event**   | A PHP class that says "this happened, send it out"             | `app/Events/` (doesn't exist yet)                          |
| **Channel** | A named "radio station" the event goes out on, e.g. `orders.5` | named in the event, permissions in `routes/channels.php`   |
| **Reverb**  | The server holding the open connections                        | `php artisan reverb:start` (your lerd worker on port 8082) |
| **Echo**    | The JS library in the browser that subscribes to channels      | `resources/js/echo.js`                                     |

Your Laravel app never talks to the browser directly. It hands the message to Reverb, and Reverb delivers it to every browser listening on that channel.

## 3. The three kinds of channels

| Type         | Who can listen                                        | PHP                              | JS                         |
| ------------ | ----------------------------------------------------- | -------------------------------- | -------------------------- |
| **Public**   | Anyone                                                | `new Channel('news')`            | `Echo.channel('news')`     |
| **Private**  | Only users your rule allows                           | `new PrivateChannel('orders.5')` | `Echo.private('orders.5')` |
| **Presence** | Allowed users, and each one can see who else is there | `new PresenceChannel('chat.1')`  | `Echo.join('chat.1')`      |

Start with public channels. They need no login, so they're the easiest to learn with.

## 4. Your first real-time feature (public channel)

**Step 1: create an event**

```sh
lerd console make:event MessageSent
```

Edit `app/Events/MessageSent.php`:

```php
<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class MessageSent implements ShouldBroadcastNow
{
    public function __construct(public string $text) {}

    public function broadcastOn(): array
    {
        return [new Channel('demo')];
    }
}
```

- `implements ShouldBroadcastNow` tells Laravel to send this event to Reverb.
- `broadcastOn()` names the channel it goes out on.
- Every **public property** (here `$text`) becomes the data the browser receives.

> `ShouldBroadcast` (without "Now") sends the event through the **queue** instead, so you'd need the queue worker running. `ShouldBroadcastNow` sends it immediately, which is simpler while you're learning. Your `.env` has `QUEUE_CONNECTION=sync`, so either one works for now.

**Step 2: listen in the browser**

Echo is already set up in your project (`bootstrap.js` imports `./echo`). Add this to `resources/js/app.js`:

```js
window.Echo.channel("demo").listen("MessageSent", (e) => {
    console.log("Got a message:", e.text);
});
```

The name in `.listen('MessageSent', …)` is the event's class name.

**Step 3: fire the event**

Open `https://lara-explore.test` with the DevTools Console open. Then in a terminal:

```sh
lerd console tinker
> event(new App\Events\MessageSent('Hello from PHP!'));
```

`Got a message: Hello from PHP!` should show up in the browser console right away, with no page refresh. Open the page in two tabs and both will get it.

In a real app, you'd fire the event from a controller after something happens, e.g. right after saving a comment:

```php
$comment = Comment::create($data);
event(new CommentPosted($comment));
```

## 5. Private channels (per-user data)

Public channels are fine for things like "new blog post". But you don't want everyone to receive _your_ order updates.

**In the event:**

```php
use Illuminate\Broadcasting\PrivateChannel;

public function broadcastOn(): array
{
    return [new PrivateChannel('orders.'.$this->order->id)];
}
```

**In `routes/channels.php`, write the permission rule:**

```php
Broadcast::channel('orders.{orderId}', function (User $user, int $orderId) {
    return $user->id === Order::findOrNew($orderId)->user_id;
});
```

**In JS:**

```js
Echo.private(`orders.${orderId}`).listen("OrderShipped", (e) =>
    console.log(e.order),
);
```

When the browser subscribes, Echo first sends a request to `/broadcasting/auth`. Laravel runs your rule, and Reverb only lets the browser join if the rule returns `true`. The user must be logged in.

## 6. Presence channels ("who's online")

Presence channels add callbacks for who is currently on the channel:

```js
Echo.join(`chat.${roomId}`)
    .here((users) => console.log("Already here:", users))
    .joining((user) => console.log(user.name, "joined"))
    .leaving((user) => console.log(user.name, "left"))
    .listen("NewMessage", (e) => console.log(e));
```

In `channels.php`, return an **array of user info** (instead of `true`) to allow the user in:

```php
Broadcast::channel('chat.{roomId}', fn (User $user, int $roomId) =>
    ['id' => $user->id, 'name' => $user->name]
);
```

## 7. How your `.env` values fit together

```env
# Laravel (PHP) → Reverb: same container, so plain http to localhost
REVERB_HOST="localhost"
REVERB_PORT=8082
REVERB_SCHEME=http

# The port Reverb itself listens on
REVERB_SERVER_PORT=8082

# Browser → nginx (HTTPS) → Reverb
VITE_REVERB_HOST="lara-explore.test"
VITE_REVERB_PORT=443
VITE_REVERB_SCHEME=https

# Shared "password" so Reverb knows the messages come from your app
REVERB_APP_KEY / REVERB_APP_SECRET / REVERB_APP_ID
```

PHP and the browser reach Reverb by different routes, which is why there are two sets of host and port settings.

## 8. When something doesn't work

| Symptom                                | Likely cause                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Nothing in the browser at all          | Reverb isn't running: `systemctl --user is-active lerd-reverb-lara-explore.service`                           |
| No WS connection in DevTools           | Vite wasn't restarted after changing `VITE_*` values                                                          |
| Connected, but the event never arrives | You used `ShouldBroadcast` with a real queue and the queue worker isn't running (`lerd worker start queue`)   |
| Private channel returns 403            | Not logged in, or your `channels.php` rule returned false                                                     |
| Event name doesn't match               | Check `.listen('ClassName')`, or set `broadcastAs()` and listen with a leading dot: `.listen('.custom.name')` |

Watching it live helps a lot: `journalctl --user -u lerd-reverb-lara-explore.service -f`. To see every connection and message, stop the worker and run `lerd console reverb:start --debug` in a terminal instead.

## Suggested practice path

1. Do section 4 (the public `demo` channel) and see the message arrive.
2. Show the message on the page instead of in the console.
3. Build a tiny form that posts a message, with the controller firing `MessageSent`. That's a basic live chat.
4. Switch it to a private channel with a login.
5. Add a presence channel to show who's online.

I took these examples from the current Laravel broadcasting docs (13.x). I can set up step 1 in your project if you want to follow along.
