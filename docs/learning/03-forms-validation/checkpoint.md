# 03 · Checkpoint

1. Why does a `store` method return a redirect instead of `Inertia::render()`?
2. Walk through what happens when `StoreMessageRequest` validation fails, from the server throwing to the error appearing under the textarea.
3. What's the difference between `$request->all()` and `$request->validated()`, and why does it matter for security?
4. Why derive `slug` in `prepareForValidation()` instead of in the controller after validation?
5. You get a **419**. What's the most likely cause?
6. When would you choose `useForm` over `<Form>`?
7. After Ada sends a message, her screen updates. Linus, in the same room in another browser, sees nothing. Why? What will fix it?
8. Why must `/rooms/create` be registered before `/rooms/{room:slug}`?
9. What does `scopeBindings()` protect against?

<details><summary>Answers</summary>

1. Post/Redirect/Get: a refresh won't re-submit, the URL matches the page shown, and Inertia follows the redirect to load fresh props.
2. The Form Request throws `ValidationException` → Laravel flashes the errors to the session and redirects back → Inertia follows the redirect → `HandleInertiaRequests` includes the session errors in the `errors` prop → `form.errors.body` (or the `errors` slot prop) is set → the template shows it.
3. `all()` is everything the client sent, including fields you never intended to accept. `validated()` is only fields that have rules. Saving `all()` invites mass-assignment abuse.
4. So the `unique` rule checks the exact value you'll save. Otherwise two names that slugify the same ("Design Team" / "design-team") pass validation and then crash on the database's unique index.
5. CSRF or session failure: an expired session, a wrong cookie domain, or a route outside the `web` group.
6. When script needs the data: send-on-Enter, conditional fields, transforming values, or calling submit programmatically.
7. HTTP only answers the person who made the request. Linus's browser never asked. Broadcasting the new message over a WebSocket (Reverb, module 06) fixes it.
8. Routes match in order. `{room:slug}` would match "create" and try to find a room with that slug, which 404s.
9. Child models from another parent. Without it, `/rooms/general/messages/42` resolves message 42 even if it belongs to `dev`.
</details>
