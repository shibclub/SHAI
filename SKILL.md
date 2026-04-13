---
name: shai-token
description: >
  SHAI token API — a lightweight tipping and transfer layer for AI agents.
  Use this skill whenever the user wants to interact with SHAI tokens: check
  balance, view transaction history, send single or batch transfers, manage
  API keys, query token metadata, verify a Twitter account, look up a wallet
  by Twitter username, or check any address/Twitter account's balance and
  transactions publicly. Triggers include: send SHAI, transfer SHAI, tip SHAI,
  SHAI balance, SHAI transactions, SHAI history, batch tip, airdrop SHAI,
  pay agent, reward agent, how much SHAI do I have, send tokens to 0x address,
  send SHAI to @twitter, SHAI token info, agent-to-agent payment, create SHAI
  API key, manage SHAI key, red packet, delegated transfer, verify twitter,
  bind twitter, link twitter wallet, check twitter balance, look up twitter
  wallet, who owns this address, public balance, public transactions, transfer
  to twitter. Also triggers for casual phrasing like "tip that agent 100 SHAI",
  "check my SHAI wallet", "send tokens to 0x...", "send 500 SHAI to @woofswap",
  "how's my SHAI balance?", "airdrop to these addresses", "create an API key
  for my bot", "verify my twitter for SHAI", "what's woofswap's SHAI balance?",
  "look up 0xabc... transactions", "who has this twitter linked?".
---

# SHAI Token Skill

SHAI is a tipping token purpose-built for AI agent economies. It provides a
centralized ledger with EVM-compatible addressing, dual authentication
(private key or API key), Twitter username support for transfers, and fully
transparent public balance/transaction lookups — no blockchain node, no gas
fees, instant finality.

## Protocol Summary

| Property       | Value                                      |
|----------------|--------------------------------------------|
| Token          | SHAI                                       |
| Max Supply     | 100,000,000,000 (hard cap)                 |
| Decimals       | 0 (integer-only)                           |
| Address Format | EVM (`0x` + 40 hex characters)             |
| Recipient      | EVM address **or** Twitter username         |
| Auth Methods   | Private key **or** API key                 |
| Public Queries | Balance and transactions are fully public  |
| Base URL       | `https://api.shibclaw.xyz`                 |
| Rate Limit     | 60 req/min per IP                          |

---

## Authentication

Two authentication methods are supported. Both identify the caller's wallet.

### Method 1: Private Key (full access)

Required for API key management. Accepted on all authenticated endpoints.
The server derives the wallet address from the key on each request.
**Private keys are never stored server-side.**

```
x-private-key: <64_hex_char_private_key>
```

The `0x` prefix is optional.

### Method 2: API Key (delegated access)

Created via private key. Accepted on balance, transactions, transfer, and
batch transfer endpoints. Ideal for bots, red-packet services, tipping
integrations, and any third-party app that should not hold the raw private key.

```
x-api-key: shai_<64_hex_chars>
```

**API key management endpoints always require the private key** — an API key
cannot create, list, delete, or regenerate other API keys.

If both headers are present, private key takes priority.

---

## Quick Decision Tree

| User wants to…                              | Endpoint                   | Auth             |
|---------------------------------------------|----------------------------|------------------|
| Check if API is alive                       | `GET /`                    | None             |
| Get token metadata                          | `GET /token`               | None             |
| Check their own SHAI balance                | `GET /balance`             | Key or API key   |
| Check anyone's balance (by address/twitter) | `GET /balance/:target`     | **None (public)**|
| View own recent transactions                | `GET /transactions`        | Key or API key   |
| View anyone's transactions                  | `GET /transactions/:target`| **None (public)**|
| Send SHAI to one recipient                  | `POST /transfer`           | Key or API key   |
| Send SHAI to multiple recipients            | `POST /transfer/batch`     | Key or API key   |
| Verify & bind a Twitter account             | `POST /verify/twitter`     | **None (public)**|
| Look up Twitter → wallet address            | `GET /twitter/:username`   | **None (public)**|
| Look up wallet → Twitter username(s)        | `GET /address/:addr/twitter`| **None (public)**|
| Create a new API key                        | `POST /apikey`             | Private key only |
| List all API keys                           | `GET /apikey`              | Private key only |
| Delete a specific API key                   | `DELETE /apikey`           | Private key only |
| Delete all API keys                         | `DELETE /apikey/all`       | Private key only |
| Revoke all & issue a new key                | `POST /apikey/regenerate`  | Private key only |

---

## Endpoints — Public Queries (no auth)

All balance and transaction data is transparent. Anyone can query any wallet.

### GET /balance/:target — Public Balance Lookup

`:target` can be an EVM address (`0x...`) or a verified Twitter username.

```bash
curl https://api.shibclaw.xyz/balance/0xAbC123...
curl https://api.shibclaw.xyz/balance/woofswap
```
→ `{"success":true,"address":"0x...","balance":"5000","twitter":["woofswap"]}`

The `twitter` field is included only if the address has verified Twitter bindings.

### GET /transactions/:target — Public Transaction History

`:target` can be an EVM address or a verified Twitter username.
Optional query param `?limit=N` (1–100, default 20).

```bash
curl "https://api.shibclaw.xyz/transactions/0xAbC123...?limit=10"
curl "https://api.shibclaw.xyz/transactions/woofswap?limit=10"
```
→ `{"success":true,"address":"0x...","transactions":[...],"twitter":["woofswap"]}`

Each transaction object: `tx_id`, `from`, `to`, `amount`, `memo`,
`direction` (`"in"` | `"out"`), `timestamp`.

---

## Endpoints — Twitter Verification & Lookup (no auth)

### POST /verify/twitter — Verify & Bind Twitter Account

Anyone can call this to verify anyone's Twitter. The tweet must:
1. Be posted by the claimed Twitter account
2. Be public
3. Contain the pattern `ShibClaw0xYourAddressHere` (case-insensitive for "ShibClaw")

```bash
curl -X POST https://api.shibclaw.xyz/verify/twitter \
  -H "Content-Type: application/json" \
  -d '{"twitter_username":"woofswap","tweet_url":"https://x.com/woofswap/status/123456"}'
```
→ `{"success":true,"twitter_username":"woofswap","address":"0x...","message":"Twitter account verified and bound to wallet."}`

**Verification rules:**
- `twitter_username` must be 1–15 alphanumeric/underscore characters
- `tweet_url` must be a valid `x.com` or `twitter.com` status URL
- The username in the URL must match `twitter_username`
- The tweet text must contain `ShibClaw` immediately followed by a valid `0x` + 40 hex char address
- Example tweet: `ShibClaw0xfb10e2b3f29931f8372680877f1e4b3a139d9fa3`

A Twitter username can be re-verified (updated) by posting a new tweet with a different address.

### GET /twitter/:username — Look Up Address by Twitter

```bash
curl https://api.shibclaw.xyz/twitter/woofswap
```
→ `{"success":true,"twitter_username":"woofswap","address":"0x..."}`

Returns 404 if not verified.

### GET /address/:address/twitter — Look Up Twitter by Address

```bash
curl https://api.shibclaw.xyz/address/0xAbC123.../twitter
```
→ `{"success":true,"address":"0x...","twitter_usernames":[{"twitter_username":"woofswap","tweet_url":"https://x.com/...","verified_at":"2026-04-13T..."}]}`

---

## Endpoints — Token Operations (authenticated)

### GET / — Health Check (no auth)

```bash
curl https://api.shibclaw.xyz/
```
→ `{"name":"SHAI","status":"online"}`

### GET /token — Token Metadata (no auth)

```bash
curl https://api.shibclaw.xyz/token
```
→ `{"name":"SHAI","max_supply":"100000000000","decimals":0,"description":"SHAI - A tipping token for AI agents"}`

### GET /balance — Own Wallet Balance

```bash
curl -H "x-api-key: API_KEY" https://api.shibclaw.xyz/balance
```
→ `{"success":true,"address":"0x...","balance":"5000"}`

### GET /transactions — Own Transaction History

Optional query param `?limit=N` (1–100, default 20).

```bash
curl -H "x-api-key: API_KEY" "https://api.shibclaw.xyz/transactions?limit=50"
```
→ Array of objects with: `tx_id`, `from`, `to`, `amount`, `memo`,
`direction` (`"in"` | `"out"`), `timestamp`

### POST /transfer — Single Transfer

The `to` field accepts three formats:
- **EVM address**: `"0xAbC123..."` — direct transfer
- **Twitter username**: `"woofswap"` — resolved to the verified wallet address
- **@Twitter**: `"@woofswap"` — same as above, `@` is stripped

```bash
# Transfer to EVM address
curl -X POST https://api.shibclaw.xyz/transfer \
  -H "Content-Type: application/json" \
  -H "x-api-key: API_KEY" \
  -d '{"to":"0xRecipient","amount":100}'

# Transfer to Twitter username
curl -X POST https://api.shibclaw.xyz/transfer \
  -H "Content-Type: application/json" \
  -H "x-api-key: API_KEY" \
  -d '{"to":"woofswap","amount":100}'

# Transfer to @Twitter
curl -X POST https://api.shibclaw.xyz/transfer \
  -H "Content-Type: application/json" \
  -H "x-api-key: API_KEY" \
  -d '{"to":"@woofswap","amount":100}'
```
→ `{"success":true,"tx_id":"uuid","from":"0x...","to":"0x...","amount":"100"}`

If the Twitter username is not verified, returns error:
`"Twitter account not verified or not bound to a wallet."`

### POST /transfer/batch — Batch Transfer

Max 100 recipients per request. Entire batch is atomic — all succeed or all fail.
Each `to` field supports EVM address, Twitter username, or @Twitter format.

```bash
curl -X POST https://api.shibclaw.xyz/transfer/batch \
  -H "Content-Type: application/json" \
  -H "x-api-key: API_KEY" \
  -d '{"transfers":[{"to":"0xAddr1","amount":500},{"to":"woofswap","amount":300},{"to":"@someuser","amount":200}]}'
```
→ `{"success":true,"from":"0x...","transfers":[{"tx_id":"uuid","to":"0x...","amount":"500"},...]}`

---

## Endpoints — API Key Management

All key management endpoints require `x-private-key`. API keys cannot manage
themselves — this prevents a compromised bot key from escalating privileges.

### POST /apikey — Create API Key

```bash
curl -X POST https://api.shibclaw.xyz/apikey \
  -H "Content-Type: application/json" \
  -H "x-private-key: KEY" \
  -d '{"label":"red-packet-bot"}'
```
→ `{"success":true,"address":"0x...","api_key":"shai_...","label":"red-packet-bot"}`

The `label` field is optional — use it to identify what each key is for.
A wallet can have multiple API keys (e.g., one per bot/service).

### GET /apikey — List API Keys

```bash
curl -H "x-private-key: KEY" https://api.shibclaw.xyz/apikey
```
→ Returns array of `{api_key (masked), label, created_at, last_used_at}`

### DELETE /apikey — Delete Specific Key

```bash
curl -X DELETE https://api.shibclaw.xyz/apikey \
  -H "Content-Type: application/json" \
  -H "x-private-key: KEY" \
  -d '{"api_key":"shai_full_key_here"}'
```
→ `{"success":true,"message":"API key deleted."}`

### DELETE /apikey/all — Delete All Keys

```bash
curl -X DELETE https://api.shibclaw.xyz/apikey/all \
  -H "x-private-key: KEY"
```
→ `{"success":true,"message":"N API key(s) deleted."}`

### POST /apikey/regenerate — Revoke All & Issue New

Atomically deletes all existing keys and creates one new key. Use when a key
is compromised or you want a clean slate.

```bash
curl -X POST https://api.shibclaw.xyz/apikey/regenerate \
  -H "Content-Type: application/json" \
  -H "x-private-key: KEY" \
  -d '{"label":"new-bot"}'
```
→ `{"success":true,"address":"0x...","api_key":"shai_...","label":"new-bot","message":"All previous keys revoked. New key issued."}`

---

## Validation Rules

1. **Integer-only amounts** — `amount` must be a positive integer. No decimals.
2. **EVM addresses** — must match `0x[0-9a-fA-F]{40}`.
3. **Twitter usernames** — 1–15 alphanumeric or underscore characters.
4. **No self-transfers** — sender and recipient cannot be the same address.
5. **Batch cap** — max 100 transfers per batch request.
6. **Supply cap** — total circulating supply can never exceed 100,000,000,000.

---

## Error Handling

All errors follow: `{"success":false,"error":"<message>"}`

| HTTP | Meaning                                              |
|------|------------------------------------------------------|
| 400  | Bad request: invalid address/username, insufficient balance, bad amount, self-transfer, tweet parsing failure |
| 401  | Invalid or missing credentials (private key or API key) |
| 404  | Endpoint, API key, or Twitter account not found      |
| 429  | Rate limited (60/min)                                |
| 500  | Internal error                                       |

When any request fails, report the error message to the user. Never expose
internal server details, database info, or stack traces.

---

## Workflow

### Public Balance / Transaction Lookup

1. User asks about any wallet or Twitter account's balance/history.
2. `GET /balance/:target` or `GET /transactions/:target` — no auth needed.
3. `:target` can be an EVM address or a verified Twitter username.
4. Report the data to the user. Include linked Twitter info if present.

### Balance Inquiry (own wallet)

1. Obtain credentials (private key or API key from config/environment/user).
2. `GET /balance` with auth header.
3. Report address and balance to the user.

### Single Transfer

1. Obtain credentials.
2. Recipient can be an EVM address, Twitter username, or @username.
3. If using Twitter username, no need to resolve manually — the API handles it.
4. Optionally `GET /balance` to confirm sufficient funds.
5. `POST /transfer` with `{"to":"recipient","amount":N}`.
6. Report `tx_id` and final state to the user.

### Batch Transfer (Airdrop / Multi-tip)

1. Obtain credentials.
2. Recipients can mix EVM addresses and Twitter usernames freely.
3. Sum total amount, `GET /balance` to confirm sufficient funds.
4. `POST /transfer/batch` with `{"transfers":[...]}`.
5. Report all `tx_id` values to the user.

### Twitter Verification

1. User wants to link their Twitter to a wallet address.
2. Instruct them to tweet: `ShibClaw0xTheirAddressHere` from their account.
3. Once tweeted, call `POST /verify/twitter` with `twitter_username` and `tweet_url`.
4. The API fetches the tweet, verifies authorship and content, and binds the account.
5. After verification, people can transfer SHAI using the Twitter username.

### Twitter Lookup

1. To find a wallet from a Twitter username: `GET /twitter/:username`
2. To find Twitter accounts linked to a wallet: `GET /address/:address/twitter`

### Transaction History

1. For own history: `GET /transactions` with auth header.
2. For any address/twitter: `GET /transactions/:target` — no auth.
3. Present as a formatted table: direction, counterparty, amount, timestamp.

### List / Query API Keys

1. Obtain the user's **private key** (API keys cannot query key lists).
2. `GET /apikey` with `x-private-key` header.
3. Present results as a table: masked key, label, created date, last used date.

### API Key Setup (for bots / third-party integrations)

1. Obtain the user's **private key** (API keys cannot do this).
2. `POST /apikey` with optional `{"label":"my-bot"}`.
3. Return the full `api_key` to the user — this is the only time it's shown in full.
4. Instruct the user to store it securely and use `x-api-key` header in their bot.

### Delete a Specific API Key

1. Obtain the user's **private key**.
2. If the user doesn't know which key to delete, run `GET /apikey` first to list them.
3. `DELETE /apikey` with `{"api_key":"shai_full_key_here"}` in the body.
4. Confirm deletion to the user.

### Delete All API Keys

1. Obtain the user's **private key**.
2. `DELETE /apikey/all` with `x-private-key` header.
3. Confirm how many keys were deleted.

### API Key Rotation (compromised key)

1. Obtain the user's **private key**.
2. `POST /apikey/regenerate` with optional label.
3. Return the new key. All previous keys are immediately revoked.

---

## Output Format

### Balance Report

```
SHAI Balance: {amount} SHAI
Wallet: {address}
Twitter: {twitter_username} (if linked)
```

### Transfer Confirmation

```
Transfer successful.
TX ID:   {tx_id}
From:    {from_address}
To:      {to_address} ({twitter_username if applicable})
Amount:  {amount} SHAI
```

### Transaction History Table

```
| Direction | Counterparty | Amount   | Time                |
|-----------|-------------|----------|---------------------|
| OUT       | 0xabc...    | 500 SHAI | 2026-04-12 14:55 UTC|
| IN        | 0xdef...    | 100 SHAI | 2026-04-12 13:20 UTC|
```

### Twitter Verification Result

```
Twitter verified successfully.
Username: {twitter_username}
Wallet:   {address}
```

### API Key Created

```
API Key created successfully.
Key:   shai_...  (store this securely — it won't be shown again in full)
Label: {label}
Use header: x-api-key: shai_...
```

### API Key List

```
| # | Key (masked)       | Label          | Created             | Last Used           |
|---|--------------------|----------------|---------------------|---------------------|
| 1 | shai_fdf42f...a74b | red-packet-bot | 2026-04-12 15:23 UTC| 2026-04-12 16:00 UTC|
| 2 | shai_a1b2c3...d4e5 | tipping-agent  | 2026-04-11 10:00 UTC| never               |
```

---

## Notes

- Private keys authenticate identity — treat them as secrets, never log or echo them
- API keys are the recommended auth for bots and integrations — avoid embedding raw private keys
- All transfers are atomic with database-level transaction isolation
- New wallets are auto-created on first incoming transfer (zero-balance until funded)
- The API is rate-limited to 60 requests per minute per IP
- Balance and transaction data is fully public and transparent — no auth needed to query
- Twitter usernames are case-insensitive and stored lowercase
- A Twitter account can only be bound to one wallet address at a time (re-verifiable)
- Multiple Twitter accounts can be bound to the same wallet address
- When any endpoint fails: report the error message — never expose server internals
- This is an off-chain ledger system, not an on-chain smart contract
