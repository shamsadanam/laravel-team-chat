# 13 · Checkpoint

1. Draw production traffic for: a browser connecting, a browser authorizing a private channel, Laravel publishing an event. Which paths does nginx proxy to Reverb?
2. Which variables does the Reverb *process* read, which does *Laravel* read, which does the *browser* read?
3. You changed `VITE_REVERB_HOST` on the server after deploying. Why does nothing change?
4. Write the four commands after `migrate` in a deploy, and explain the last two.
5. What do users experience during `reverb:restart`, and what makes it harmless?
6. Reverb stops accepting connections at about 1,000. What's the likely cause, and the fix?
7. You add a second Reverb server behind a load balancer and some users miss events. What's missing?
8. What does `allowed_origins` protect against, and what doesn't it protect against?
9. What does Reverb's `rate_limiting` count?

<details><summary>Answers</summary>

1. Browser → 443 → nginx `/app` → Reverb (WebSocket). Browser → 443 → nginx → PHP-FPM `/broadcasting/auth` (normal HTTP). Laravel → Reverb `/apps` (internal HTTP, or through nginx `/apps`). nginx proxies `/app` and `/apps` to Reverb.
2. Reverb process: `REVERB_SERVER_HOST/PORT` (+ app id/key/secret, scaling). Laravel: `REVERB_HOST/PORT/SCHEME` + key/secret/id. Browser: `VITE_REVERB_*` (key, host, port, scheme).
3. `VITE_*` values are compiled into the JS bundle at build time. Rebuild.
4. `php artisan optimize`, `php artisan up` (if you used `down`), `php artisan queue:restart` (workers finish their job, exit, and restart with new code), `php artisan reverb:restart` (Reverb closes connections gracefully and restarts with new code and config).
5. All sockets drop; Echo reconnects within seconds; events in the gap are lost. Re-syncing volatile props on reconnect (module 10) makes it invisible.
6. The default `stream_select` event loop is limited to ~1024 file descriptors. Install `ext-uv` (and raise OS/Supervisor/nginx file limits).
7. `REVERB_SCALING_ENABLED=true` with a shared Redis, so servers relay messages to each other.
8. Other websites opening sockets with your key from their visitors' browsers. Not non-browser clients (they can fake `Origin`). Channel auth is the real protection.
9. Incoming frames per connection (subscribes, pings, client events), in memory, per Reverb process.
</details>
