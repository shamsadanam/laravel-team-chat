# 13 · Reverb in production

**Goal:** know everything between "it works on lerd" and "it runs for real users": topology, TLS, process management, deploys, capacity, scaling, security and monitoring.

**You'll touch:** mostly reading and configuring: `config/reverb.php`, `.env`, nginx/Supervisor examples. Exercises run against your lerd setup, which is already a small production-shaped deployment.

---

## 1. Production topology

```
                         ┌──────────── your server(s) ────────────┐
Browser ──wss:443──▶ nginx / load balancer (TLS)                   │
   │                     ├── /          → PHP-FPM (Laravel)        │
   │                     └── /app, /apps → Reverb 0.0.0.0:8080     │
   │                                                               │
   └──https:443──▶ POST /broadcasting/auth → Laravel               │
                                                                   │
Laravel / queue workers ──http://127.0.0.1:8080/apps/…──▶ Reverb   │
                         └──────────────────────────────────────────┘
```

You've already seen this exact shape: lerd's nginx proxies `/app` and `/apps` to Reverb on 8082 (module 05 §4). Production is the same with real certificates and a process manager.

- **`/app`** is the WebSocket endpoint (browsers). **`/apps`** is the HTTP API (Laravel publishing events). Proxy **both**.
- Reverb itself speaks plain `ws`/`http`. TLS terminates at nginx or the load balancer.
- Two common layouts: the **same domain** (`example.com/app`, as lerd does) or a **subdomain** (`ws.example.com`). The same domain avoids CORS and cookie questions; a subdomain lets you scale Reverb on separate machines.

## 2. The environment, for production

```ini
# Where the Reverb process listens
REVERB_SERVER_HOST=0.0.0.0
REVERB_SERVER_PORT=8080

# Where Laravel sends events (server-to-server)
REVERB_HOST=127.0.0.1          # or the internal hostname of the Reverb box
REVERB_PORT=8080
REVERB_SCHEME=http

# Where browsers connect (baked into JS at BUILD time)
VITE_REVERB_APP_KEY="${REVERB_APP_KEY}"
VITE_REVERB_HOST=example.com   # or ws.example.com
VITE_REVERB_PORT=443
VITE_REVERB_SCHEME=https
```

> **Build-time trap:** `VITE_*` values are compiled into the bundle by `npm run build`. If CI builds assets with the wrong `.env`, every browser connects to the wrong place, and changing `.env` on the server afterwards does nothing. Build with production values, or rebuild after changing them.

Many hosts set `REVERB_HOST` to the public domain and go through nginx even for server-to-server traffic. That works, but adds TLS and a proxy hop to every broadcast. Prefer the internal address when Laravel and Reverb share a network.

## 3. nginx

```nginx
location ~ ^/apps?(/|$) {
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Scheme $scheme;
    proxy_set_header SERVER_PORT $server_port;
    proxy_set_header REMOTE_ADDR $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";

    proxy_pass http://127.0.0.1:8080;
}
```

Compare it with `~/.local/share/lerd/nginx/conf.d/laravel-reverb-example.test.conf`. Same idea. Note lerd's `proxy_read_timeout 60s`: it must stay above Reverb's ping interval, or nginx will cut idle sockets.

For many connections, nginx itself needs headroom (`nginx.conf`):

```nginx
worker_rlimit_nofile 10000;
events { worker_connections 10000; multi_accept on; }
```

## 4. Keeping Reverb running

Reverb is a long-running process, like a queue worker. Use a process manager.

**Supervisor:**

```ini
[program:reverb]
command=php /var/www/app/artisan reverb:start
autostart=true
autorestart=true
user=forge
redirect_stderr=true
stdout_logfile=/var/www/app/storage/logs/reverb.log
stopwaitsecs=10
minfds=10000
```

`minfds` raises Supervisor's open-file limit; every connection is a file descriptor. (Locally, lerd does the same job with a systemd user unit, `Restart=always`. You saw it in module 11.)

## 5. Deploying

Long-running processes keep old code in memory. Every deploy must restart them **gracefully**:

```bash
# …pull code, composer install --no-dev, npm ci && npm run build (with prod VITE_ values)…
php artisan migrate --force
php artisan optimize
php artisan queue:restart     # workers exit after their current job; the manager restarts them
php artisan reverb:restart    # closes connections gracefully; the manager restarts Reverb
```

What users experience on `reverb:restart`: every socket disconnects; Echo reconnects within seconds; **events in the gap are lost**. This is exactly why module 10's re-sync-on-reconnect exists. With it, deploys are invisible. Without it, every deploy silently drops messages.

Restart Reverb only when Reverb-related code or config changed. Channel callbacks run in PHP-FPM (`/broadcasting/auth`), not in Reverb, so they don't need it.

## 6. Capacity: the four ceilings

| Ceiling | Default | Raise it with |
| --- | --- | --- |
| OS open files per process | often 1024 | `ulimit -n`, `/etc/security/limits.conf`, Supervisor `minfds` |
| Event loop | `stream_select`, ~1024 connections max | Install `ext-uv` (`pecl install uv`); Reverb picks it up automatically |
| nginx connections | `worker_connections` (often 768–1024) | `nginx.conf` (§3) |
| Ephemeral ports (proxy → Reverb) | ~28k | `/etc/sysctl.conf` port range, or scale horizontally |

The event-loop limit catches people out most often: Reverb happily runs on `stream_select`, then stops accepting new connections around 1,000. If you expect more, install `ext-uv`. (In this project's environment, PHP extensions are managed by lerd: `lerd` `runtime ext_add`, which rebuilds the PHP image. Don't install it unless you need it.)

## 7. Scaling out

One Reverb server handles a lot of connections, but at some point you add machines:

```ini
REVERB_SCALING_ENABLED=true
```

- Every Reverb server connects to the **same Redis** (your default Redis connection; locally `lerd-redis`) and publishes incoming messages there, so a client on server B receives an event Laravel sent to server A.
- Presence membership stays consistent across servers.
- Put the servers behind a load balancer that supports WebSockets.
- Run `pulse:check` (if you use Pulse) on **one** server only.

**Managed alternatives:** Laravel Cloud runs Reverb clusters for you; Forge configures Reverb, nginx and Supervisor on your own servers. Before hand-rolling everything above, check whether one of those fits.

## 8. Security checklist

| Setting | Your value | Production |
| --- | --- | --- |
| `allowed_origins` | `['*']` | Your domain(s) only: `['example.com']`. Stops other sites from opening sockets with your key |
| `REVERB_APP_SECRET` | dev value | Strong, secret, rotated if it ever leaks (module 07.7) |
| Channels | private/presence for anything non-public | Audit: no private data on `Channel` |
| `accept_client_events_from` | `members` | `members`, or disable whispers if unused |
| `max_message_size` | 10,000 bytes | Keep it small. Big payloads belong in HTTP |
| `rate_limiting.enabled` | `false` | Consider enabling. It limits **incoming frames per connection** (whispers, subscribes, pings) |
| `max_connections` | unset | Set a ceiling per app to protect the server |
| Payloads | `broadcastWith()` everywhere | Leak tests (module 12) in CI |

## 9. Monitoring

- **Logs:** Reverb's stdout (Supervisor log, or `journalctl` for lerd's unit). Failed broadcasts appear in `failed_jobs` and `laravel.log`.
- **Pulse:** Reverb ships Pulse recorders (`ReverbConnections`, `ReverbMessages`) for connection and message graphs. It requires installing `laravel/pulse` first.
- **Synthetic check:** a scheduled job that broadcasts to a test channel while a small script listens. It tells you the *whole path* works, not just that the process is up.
- **Client signal:** module 05's connection-status badge, but reported. Log `failed`/`reconnecting` durations from real users.

## What you should be able to explain now

- The production topology, and why both `/app` and `/apps` are proxied.
- All three variable groups for production, and the build-time trap.
- The deploy sequence, and why re-sync-on-reconnect makes `reverb:restart` invisible.
- The four capacity ceilings and how to raise each.
- How Redis scaling works.
- The production security checklist.

Next: [exercises](02-exercises.md).
