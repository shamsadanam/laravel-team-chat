# 05 · Solutions

---

## 05.1 The handshake

- URL: `wss://laravel-reverb-example.test/app/0fe2wwwlfj487sklrp06?protocol=7&client=js&version=…`. The host and port (443, implied by `wss`) come from `VITE_REVERB_HOST`, `VITE_REVERB_PORT` and `VITE_REVERB_SCHEME`. The path segment is `REVERB_APP_KEY` (via `VITE_REVERB_APP_KEY`).
- Status **101 Switching Protocols**: the HTTP connection is upgraded to a WebSocket.
- Frames:
  1. ⬇ `{"event":"pusher:connection_established","data":"{\"socket_id\":\"123.456\",\"activity_timeout\":30}"}`
  2. ⬆ `{"event":"pusher:subscribe","data":{"channel":"demo"}}`
  3. ⬇ `{"event":"pusher_internal:subscription_succeeded","channel":"demo"}`
- You'll also see `pusher:ping` / `pusher:pong` every ~30s. That's the keep-alive (`activity_timeout` in `config/reverb.php`).

---

## 05.2 Every hop

Reverb debug output shows the incoming API call and the message it fans out to subscribers on `demo`. Each window's WS tab shows:

```json
{"event":"App\\Events\\MessageSent","data":"{\"text\":\"hello from tinker\"}","channel":"demo"}
```

`data` is a JSON **string** inside the frame. Echo parses it before calling your callback.

---

## 05.3 Payload shape

```json
{"text":"hello from tinker","from":"tinker"}
```

`$secret` doesn't appear. Laravel builds the payload from **public** properties only. (`socket` may appear too; it's used by `toOthers()` in module 06.)

---

## 05.4 Custom name

```php
public function broadcastAs(): string
{
    return 'demo.message';
}
```

```ts
useEchoPublic('demo', '.demo.message', (e) => console.log(e.text));
```

Without the dot, Echo's namespace formatter rewrites `demo.message` to `App\Events\demo.message`, which never matches.

---

## 05.5 Status badge

```vue
<script setup lang="ts">
import { useConnectionStatus } from '@laravel/echo-vue';
import { computed } from 'vue';

const status = useConnectionStatus();

const color = computed(() => {
    if (status.value === 'connected') {
        return 'bg-green-500';
    }

    return ['connecting', 'reconnecting'].includes(status.value) ? 'bg-amber-500' : 'bg-red-500';
});
</script>

<template>
    <span class="fixed bottom-2 left-2 flex items-center gap-1 text-xs">
        <span class="size-2 rounded-full" :class="color" />
        {{ status }}
    </span>
</template>
```

pusher-js retries automatically with backoff, so after a restart the badge goes green on its own within a few seconds. Remember this for module 10: **reconnecting doesn't replay what you missed.**

---

## 05.6 Break it four ways

1. **`http` scheme on an https page**: the browser blocks `ws://` from a secure page (mixed content), or nginx on 443 rejects it. Hop 1 fails: no 101 in the WS tab.
2. **Wrong event name**: connected, subscribed, the frame arrives in the WS tab, but the callback never runs. Hop 5.
3. **`ShouldBroadcast`, no worker**: tinker returns instantly, a row sits in `jobs`, and nothing reaches Reverb. Hop 3. Start the worker and the job runs; the message arrives late. Delivery isn't instant, but nothing is lost.
4. **Secret mismatch**: Laravel's signed API call is rejected by Reverb (an authentication error in the exception or log). Hop 3/4. Fix `.env` back, or restart Reverb so both sides agree.

---

## 05.7 Raw socket

Public channels need nothing but the key, so the raw subscribe works.

`private-…` channels need `data.auth` = `"<key>:<HMAC-SHA256(secret, "<socket_id>:<channel>")>"`. Only something holding the **secret** can make that signature: your Laravel app, at `/broadcasting/auth`, and only after it has run your authorization callback. That's the whole security model of private channels, and the subject of module 07.
