# Security Specification (TDD) for Smart Ledger

## 1. Data Invariants

1. **User Ownership Boundaries**: No user can read, write, update, or delete another user's profile document or ledger items. Access is strictly isolated by `userId` (where `userId == request.auth.uid`).
2. **Strict Document Schema**: 
    - `users/{userId}` requires custom keys (`uid`, `email`, `people`, `updatedAt`). The list of people must be bounded in length (max 15 members).
    - `users/{userId}/entries/{entryId}` requires fields (`id`, `particulars1`, `particulars2`, `amount`, `paymentMode`, `person`).
3. **Immutability**:
    - `id` on entries cannot be modified after creation.
    - `createdAt` is system-locked to the server timestamp during creation and cannot be changed.
4. **Verified Session**:
    - Standard operations require user registration and authentication (`request.auth.uid != null`).
    - If user has email verification configured, rules enforce security checks dynamically.

---

## 2. The "Dirty Dozen" Payloads

Here are 12 specific payloads or access patterns that our Firestore Security Rules must block:

1. **Unauthenticated Read Profile**: Reader without Auth trying to get `/users/someUser`.
2. **Cross-User Read Profile**: Authenticated User A trying to get `/users/userB`.
3. **Profile Shadow Field Injection**: User trying to write `/users/authId` with additional system properties like `role` or `isAdmin`.
4. **Profile Overlarge Bounded Array**: User writing more than 15 names in the `people` array.
5. **Unauthenticated Read Entries**: Reader without Auth trying to query `/users/someUser/entries`.
6. **Cross-User Query/List Entries**: Authenticated User A trying to read/list `/users/userB/entries`.
7. **Cross-User Write Entry**: Authenticated User A trying to write an entry to `/users/userB/entries/someEntryId`.
8. **Entry Invalid Field Type**: Trying to set `amount` as a boolean or string instead of a number.
9. **Entry Invalid Enum Value**: Setting `paymentMode` to "Bitcoin" instead of "Cash" or "Online".
10. **Entry ID Poisoning / Oversized ID**: Specifying an entry ID string longer than 128 characters or containing illegal characters.
11. **Malicious Timestamp Creation**: Forcing a client-side timestamp for `createdAt` instead of relying on `request.time`.
12. **Malicious Client-side Post-Write Update**: Trying to edit the immutable `createdAt` field on an existing entry.

---

## 3. The Test Runner Layout

All tests simulate Firestore operations against the `firestore.rules` configuration to verify that operations corresponding to the Dirty Dozen return `PERMISSION_DENIED`, while operations fulfilling standard user scenarios succeed.
