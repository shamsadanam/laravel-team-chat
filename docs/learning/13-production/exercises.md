# 13 · Exercises

Some of these change shared config. Commit before you start, and revert what the exercise says to revert.

---

## 13.1 🟢 Annotate your setup

Write `docs/learning/13-production/my-setup.md` (your own notes) mapping **every** box in lesson §1's diagram to your lerd setup: which process, container, port, config file and `.env` variable. Then write the `.env` Reverb block you'd use for a production server at `chat.example.com` with Reverb on the same machine.

**Done when** every arrow in the diagram has a concrete answer for both lerd and your imaginary production server.

---

## 13.2 🟢 Lock down origins

1. Change `allowed_origins` in `config/reverb.php` to read from env: `explode(',', env('REVERB_ALLOWED_ORIGINS', '*'))`, and set `REVERB_ALLOWED_ORIGINS=laravel-reverb-example.test`.
2. Restart Reverb (`lerd worker stop reverb && lerd worker start reverb`).
3. From your app's own page: still connects.
4. From a different origin: open DevTools on any other website (e.g. `https://example.com`) and open a raw socket to `wss://laravel-reverb-example.test/app/<key>?protocol=7&client=js&version=8.4.0`.

**Done when** step 3 works and step 4 is rejected. Note the exact error frame you get.

<details><summary>Hint</summary>

Reverb compares the request's `Origin` header host with the list. Hosts only, no scheme.
</details>

---

## 13.3 🟢 The build-time trap

1. `lerd worker stop vite`.
2. Build production assets: `lerd php npm run build`, or on the host if Node is available. (Check how this project's `package.json` defines `build`.)
3. Search the built JS for your Reverb host: `grep -o "laravel-reverb-example.test" public/build/assets/*.js | head`.
4. Change `VITE_REVERB_HOST` in `.env` to `wrong.test` **without rebuilding**, and reload the app. Does it connect to `wrong.test`?
5. Revert `.env`, delete `public/build` (or rebuild) and `lerd worker start vite`.

**Done when** you can explain why step 4's answer is what it is, and what that means for CI pipelines.

---

## 13.4 🟡 Deploy rehearsal

Write `deploy.sh` (in your notes, not executed against anything real) for a server with Supervisor-managed `reverb` and `queue` programs. It should include: maintenance considerations, install, build, migrate, cache, and the graceful restarts in the right order. Then simulate the part that matters locally:

1. Ada and Linus chatting in `general`.
2. `lerd artisan reverb:restart` (lerd's systemd unit restarts it).
3. During the ~5s gap, Linus sends 2 messages.

**Done when** Ada ends up with both messages thanks to 10.4's re-sync, and your script restarts queue workers **and** Reverb.

<details><summary>Hint</summary>

Does `reverb:restart` reach the Reverb process running inside the lerd container? It signals through the cache, like `queue:restart`. Watch `journalctl --user -u lerd-reverb-laravel-reverb-example -f` to see it exit and come back.
</details>

---

## 13.5 🟡 Rate-limit noisy clients

1. Enable `REVERB_APP_RATE_LIMITING_ENABLED=true`, `REVERB_APP_RATE_LIMIT_MAX_ATTEMPTS=20`, `REVERB_APP_RATE_LIMIT_DECAY_SECONDS=10`. Restart Reverb.
2. From the console (using the dev-only `window.echo` helper from 08.5), whisper `typing` 50 times in a loop.
3. Observe what happens to that connection (WS tab).
4. Try `REVERB_APP_RATE_LIMIT_TERMINATE=true`.

**Done when** you can describe the behavior with and without terminate, and you've chosen production values for your chat (with reasoning). Revert or keep them deliberately.

---

## 13.6 🔴 Two Reverb servers, one Redis

Prove horizontal scaling works, locally:

1. `REVERB_SCALING_ENABLED=true` (Redis is `lerd-redis`, already in `.env`). Restart the Reverb worker.
2. Start a **second** Reverb on another port inside the container: `lerd php artisan reverb:start --port=8083`.
3. Make 8083 reachable from your browser: `lerd php:ports add 8083` (see `lerd php:ports --help`).
4. In a console, open a raw socket to `ws://localhost:8083/app/<key>?protocol=7&client=js&version=8.4.0` and subscribe to the public `demo` channel (module 05).
5. Dispatch `MessageSent` from tinker. Laravel publishes to **8082**.

**Done when** the client connected to 8083 receives the event. Then set `REVERB_SCALING_ENABLED=false`, restart, and show it no longer does. Clean up the extra port and process afterwards.

---

## 13.7 🔴 Pulse dashboard (optional, installs a package)

This exercise adds a dependency, so decide first whether you want Pulse in this project. If yes, install `laravel/pulse` yourself following the Pulse docs, add the `ReverbConnections` and `ReverbMessages` recorders and cards, and run `pulse:check`.

**Done when** the Pulse dashboard shows connection counts rising as you open tabs.
