# Realtime Database rules — audit notes

Applies to `database.rules.json`. Three changes were made during the security
audit; each one is a behaviour change, so read this before deploying.

---

## 1. `chats/{orderId}/buyerId` and `.../sellerId` were world-readable to any signed-in user

**Before**

```json
"buyerId": { ".read": "auth != null", ".write": false, ... }
```

**After**

```json
"buyerId": {
  ".read": "auth != null && (root.child('chats/'+$orderId+'/buyerId').val() === auth.uid || root.child('chats/'+$orderId+'/sellerId').val() === auth.uid)",
  ".write": false,
  ".validate": "newData.isString() && newData.val().matches(/^[A-Za-z0-9_-]{1,128}$/)"
}
```

**Why it mattered:** the real buyer uid and seller uid of *any* chat could be read
by *any* signed-in user, just by enumerating order ids. On its own that is only
a uid-mapping leak — but `firestore.rules` lets any signed-in user read the whole
`users` collection (needed for public seller profiles), so the two together gave
any registered account a complete buyer↔seller↔order graph, which is exactly
what a scammer needs before deciding who to impersonate in a chat.

**Why this does not break anything:**

- No client code reads these two fields. `js/order-workspace.js` and
  `js/request-system.js` only ever subscribe to / write under
  `chats/{orderId}/messages`.
- The `.read` / `.write` expressions elsewhere in this file that *do* reference
  these fields all use `root.child(...)`, which the rules engine evaluates
  server-side against the whole tree. It is **not** subject to `.read`. So
  narrowing `.read` cannot lock a chat's own participants out of their messages.
- Admins read chat transcripts through `functions/api/admin-dispute-detail.js`,
  which uses the service account and therefore bypasses these rules entirely —
  the reason `database.rules.json` has no `isAdmin()` concept at all.

`.validate` was added so that the value can only ever be a plausible Firebase
uid even when written by the service account.

---

## 2. Message `.validate` was presence-only

**Before**

```json
".validate": "newData.hasChildren(['senderId','senderName','type','createdAt'])"
```

That means any member of a chat could:

- write arbitrarily large extra subtrees under the message (storage abuse /
  cost, and a place to stash arbitrary payloads that survive forever because
  `.validate` doesn't stop it);
- set `senderName` to any name at all, so a buyer could post a message rendered
  with the seller's name — impersonation in the one UI where users make payment
  decisions;
- add `readBy: { "<any uid>": true }`, marking arbitrary users as having read
  the message (that entry's own `.validate` did not check whose uid it was).

**After:** the message must have `senderId` / `senderName` / `type` / `createdAt`,
must contain *nothing outside* the known field set (`hasOnly`), `senderId` must
look like a real Firebase uid, `senderName` must be a 1–120 character string,
`type` must be one of the known values, `createdAt` must be a number, and every
free-text field is length-bounded. `readBy/$uid` now also requires that `$uid`
is one of the two parties to the chat.

> ### ⚠️ If you add a new message `type`, add it to the `type` allow-list too
>
> The allow-list lives in `messages/$messageId/.validate`:
>
> ```
> /^(text|image|file|delivery|buyer_instructions|shipping_update|request_brief|product_order_brief)$/
> ```
>
> These are exactly the types the client currently sends:
> `js/request-system.js` (`request_brief`, `product_order_brief`),
> `js/order-workspace.js` (`text`, `image`, `file`, `delivery`,
> `buyer_instructions`, `shipping_update`), `js/seller-dashboard.js` (`text`).
>
> If a new type is added client-side and forgotten here, Realtime Database will
> reject **every** message of that type — silently, from the user's point of
> view. The push simply never appears.

If you add a new message *field*, add it to `hasOnly(...)` as well, or the whole
message will be rejected.

---

## 3. `chats/{orderId}/typing/{uid}` had no `.validate` at all

Any signed-in user could write an arbitrarily large object under their own key —
unbounded storage growth on a database that is billed by size. It is now
restricted to the two parties of the chat and to a boolean value.

Note that no client code currently writes to `typing` at all (only the
`#typingIndicator` DOM element exists, in `js/order-workspace.js`), so this is
pure hardening of a node that is currently unused rather than a fix to observed
misbehaviour.