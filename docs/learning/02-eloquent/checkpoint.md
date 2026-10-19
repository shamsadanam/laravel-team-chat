# 02 · Checkpoint

1. You pushed a migration and a teammate ran it. Now you realise a column should be nullable. What do you do?
2. What does `foreignId('room_id')->constrained()->cascadeOnDelete()` give you that a plain `unsignedBigInteger('room_id')` doesn't?
3. A form posts `{ "name": "x", "owner_id": 999 }` and you call `Room::create($request->all())`. What stops `owner_id` from being set, and is that alone enough?
4. What's the difference between `$room->messages` and `$room->messages()`?
5. Explain N+1 in one sentence. Name the fix and the safety net.
6. Why does the pivot table have a composite primary key `(room_id, user_id)`?
7. Why should the page and (later) the WebSocket both use `MessageResource`?
8. Which index serves "latest 50 messages in room X", and why that column order?

<details><summary>Answers</summary>

1. Write a **new** migration that changes the column (`$table->text('description')->nullable()->change();`). Never edit a migration that has already run elsewhere.
2. A real database constraint: Postgres rejects orphan rows, and deleting the room deletes its messages at the database level, even outside Laravel.
3. `#[Fillable]`. It's enough only if `owner_id` isn't in the list. In this course it *is* fillable (the seeder sets it), so the real fix is to never pass raw input: use validated data and set `owner_id` from the authenticated user (module 03/04).
4. Property: runs the query (once, then cached on the model) and returns a Collection. Method: returns a query builder you can add constraints to before `get()`.
5. N+1: one query for the list plus one per item for a relationship. Fix: eager load with `with()`. Safety net: `Model::preventLazyLoading()`.
6. A user can't be a member of the same room twice, and lookups by that pair are fast.
7. One definition of the message shape, so messages loaded with the page and messages arriving live render identically.
8. `(room_id, created_at)`. The query filters by `room_id` first, then sorts by `created_at`. The index is sorted the same way, so the database reads 50 entries and stops.
</details>
