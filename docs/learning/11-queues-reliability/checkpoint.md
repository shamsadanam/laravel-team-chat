# 11 · Checkpoint

1. Name three things that get better when you switch from `ShouldBroadcastNow` to `ShouldBroadcast`, and one thing that gets worse.
2. You edited `MessagePosted::broadcastWith()` and nothing changed. What did you forget?
3. A queued event has a `Message` property. What's in the job payload, and what happens if the message was deleted before the job ran?
4. Explain the transaction race in four steps. Why doesn't it show up locally with the `database` queue?
5. Two ways to make queued broadcasts wait for commit?
6. How can `message.updated` reach a client before `message.posted`? What should the client do?
7. When is `ShouldRescue` appropriate, and what does it do?
8. Why did your `broadcasts`-queue events never arrive until you changed the lerd worker?
9. Why move a "broadcast to every member" loop into a job?

<details><summary>Answers</summary>

1. Better: faster requests, Reverb outages don't break user actions, failed broadcasts retry. Worse: delivery depends on a running, up-to-date worker, and adds a bit of latency. (Also: transaction and ordering concerns appear.)
2. `lerd artisan queue:restart`: the worker still runs the old code.
3. Only the model's class and id (`SerializesModels`). The worker re-fetches it. If it's gone, `BroadcastEvent`'s default `deleteWhenMissingModels = true` silently drops the job.
4. Open a transaction → write → dispatch the queued event (job is pushed) → the worker runs it **before** commit and can't see the uncommitted rows. With the `database` queue, the job row is inside the same transaction, so the worker can't see the job before commit either.
5. `ShouldDispatchAfterCommit` on the event, or `'after_commit' => true` on the queue connection.
6. Multiple workers, retries or separate queues reorder jobs. The client ignores or parks unknown ids, inserts by id/time, and handles everything idempotently, or reloads from the server.
7. For immediate (`Now`) broadcasts that are nice-to-have. It catches and reports the exception so the user's request still succeeds.
8. The lerd worker runs `queue:work --queue=default`. Nothing listened to `broadcasts`.
9. So the request does one cheap dispatch instead of N calls to Reverb, its time no longer grows with room size, and failures retry independently.
</details>
