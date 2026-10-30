# 13 · Solutions

---

## 13.1 Your setup mapped

| Diagram box | lerd | Production at `chat.example.com` |
| --- | --- | --- |
| TLS + proxy | lerd nginx container, cert from lerd's CA, `laravel-reverb-example.test.conf` | nginx with a real cert (Let's Encrypt) |
| Reverb process | `lerd-reverb-laravel-reverb-example` systemd unit → `reverb:start --port=8082` inside `lerd-php85-fpm` | Supervisor `[program:reverb]` → `reverb:start` on 8080 |
| Laravel → Reverb | `REVERB_HOST=localhost`, `REVERB_PORT=8082`, `http` | `127.0.0.1:8080`, `http` |
| Browser → Reverb | `VITE_REVERB_HOST=laravel-reverb-example.test`, `443`, `https` | `chat.example.com`, `443`, `https` |
| Queue worker | `lerd-queue-…` unit | Supervisor `[program:queue]` |

Production `.env`:

```ini
REVERB_APP_ID=…
REVERB_APP_KEY=…
REVERB_APP_SECRET=…          # new, strong, never the dev value
REVERB_SERVER_HOST=0.0.0.0
REVERB_SERVER_PORT=8080
REVERB_HOST=127.0.0.1
REVERB_PORT=8080
REVERB_SCHEME=http
REVERB_ALLOWED_ORIGINS=chat.example.com

VITE_REVERB_APP_KEY="${REVERB_APP_KEY}"
VITE_REVERB_HOST=chat.example.com
VITE_REVERB_PORT=443
VITE_REVERB_SCHEME=https
```

---

## 13.2 Origins

```php
'allowed_origins' => explode(',', env('REVERB_ALLOWED_ORIGINS', '*')),
```

From a foreign origin, Reverb answers with an error frame (an "Origin not allowed" message, code in the 4000 range) and closes the connection. Your own site connects normally.

Origins protect against *other websites* using your key from their visitors' browsers. They don't stop non-browser clients (a script can fake `Origin`). Private-channel auth is still the real gate.

---

## 13.3 Build-time trap

After `npm run build`, the host string is **inside** the compiled JS. Changing `.env` afterwards changes nothing for browsers: they load the already-built file. (With the Vite dev server running, `.env` changes do apply after a Vite restart. That difference is exactly why it surprises people in production.)

For CI: build assets with **production** `VITE_*` values (CI secrets or a production `.env` at build time), or build on the server during deploy. One bundle can't serve two environments with different Reverb hosts unless you read them at runtime (e.g. from Inertia shared props) instead of `import.meta.env`.

---

## 13.4 Deploy script

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /var/www/app

git pull --ff-only
composer install --no-dev --optimize-autoloader --no-interaction
npm ci && npm run build                 # with production VITE_ values

php artisan down --render="errors::503" --retry=15   # optional, for risky migrations
php artisan migrate --force
php artisan optimize
php artisan up

php artisan queue:restart               # graceful: finish current job, exit, Supervisor restarts
php artisan reverb:restart              # graceful: close sockets, exit, Supervisor restarts
```

Order: code and assets first, then schema, then caches, then restart the long-running processes so they boot with the new code. If a deploy doesn't touch Reverb-related code or config, skip `reverb:restart` and save users a reconnect.

Local simulation: `reverb:restart` sends the restart signal through the cache. The process exits, systemd brings it back after ~5s, Echo reconnects, and 10.4's watcher reloads `messages`, so Ada sees Linus's two gap messages.

---

## 13.5 Rate limiting

Reverb counts **every incoming frame** per connection (subscribes, pings, whispers). Over the limit:

- `terminate_on_limit = false`: the over-limit frames are rejected with an error frame; the connection stays open.
- `terminate_on_limit = true`: the connection is closed. Echo reconnects, but an abusive script is slowed down a lot.

Reasonable chat values: ~60 frames per 60s per connection is plenty for normal use (pings every 30s + occasional subscribes + throttled whispers at 1 per 2s). Keep `terminate` off at first and watch the logs before tightening. The limiter's state is in memory per Reverb process, so with scaling it's per server, not global.

---

## 13.6 Scaling proof

With scaling **on**, the 8082 server receives Laravel's API call and publishes it on Redis (channel `reverb` by default, `REVERB_SCALING_CHANNEL`). The 8083 server is subscribed to Redis and delivers to its own sockets. The raw client on 8083 gets the event.

With scaling **off**, 8083 never hears about it, which shows why multiple servers without Redis scaling silently lose events for some clients.

Cleanup: stop the 8083 process (Ctrl+C), remove the published port (`lerd php:ports --help` lists the remove subcommand), set `REVERB_SCALING_ENABLED=false` unless you want it, and restart the Reverb worker.

---

## 13.7 Pulse

`config/pulse.php`:

```php
use Laravel\Reverb\Pulse\Recorders\ReverbConnections;
use Laravel\Reverb\Pulse\Recorders\ReverbMessages;

'recorders' => [
    ReverbConnections::class => ['sample_rate' => 1],
    ReverbMessages::class => ['sample_rate' => 1],
    // …
],
```

Dashboard view (`resources/views/vendor/pulse/dashboard.blade.php` after publishing):

```blade
<livewire:reverb.connections cols="full" />
<livewire:reverb.messages cols="full" />
```

Run `php artisan pulse:check` as another long-running process (a custom lerd worker, like 11.5). Connections are sampled on an interval (`pulse_ingest_interval`, 15s), so the graph lags a little behind reality.
