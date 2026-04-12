---
name: shai-token
description: >
  SHAI token API — a lightweight tipping and transfer layer for AI agents.
  Use this skill whenever the user wants to interact with SHAI tokens: check
  balance, view transaction history, send single or batch transfers, manage
  API keys, or query token metadata. Triggers include: send SHAI, transfer
  SHAI, tip SHAI, SHAI balance, SHAI transactions, SHAI history, batch tip,
  airdrop SHAI, pay agent, reward agent, how much SHAI do I have, send tokens
  to 0x address, SHAI token info, agent-to-agent payment, create SHAI API key,
  manage SHAI key, red packet, delegated transfer. Also triggers for casual
  phrasing like "tip that agent 100 SHAI", "check my SHAI wallet", "send
  tokens to 0x...", "how's my SHAI balance?", "airdrop to these addresses",
  "create an API key for my bot", "revoke my SHAI key", "show my API keys",
  "list my SHAI keys", "do I have any API keys?", "query my API key".
---

# SHAI Token Skill

SHAI is a tipping token purpose-built for AI agent economies. It provides a
centralized ledger with EVM-compatible addressing and dual authentication
(private key or API key) — no blockchain node, no gas fees, instant finality.

## Protocol Summary

| Property       | Value                          |
|----------------|--------------------------------|
| Token          | SHAI                           |
| Max Supply     | 100,000,000,000 (hard cap)     |
| Decimals       | 0 (integer-only)               |
| Address Format | EVM (`0x` + 40 hex characters) |
| Auth Methods   | Private key **or** API key     |
| Base URL       | `https://api.shibclaw.xyz`     |
| Rate Limit     | 60 req/min per IP              |

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

| User wants to…                        | Endpoint                | Auth           |
|---------------------------------------|-------------------------|----------------|
| Check if API is alive                 | `GET /`                 | None           |
| Get token metadata                    | `GET /token`            | None           |
| Check their SHAI balance              | `GET /balance`          | Key or API key |
| View recent transactions              | `GET /transactions`     | Key or API key |
| Send SHAI to one address              | `POST /transfer`        | Key or API key |
| Send SHAI to multiple addresses       | `POST /transfer/batch`  | Key or API key |
| Create a new API key                  | `POST /apikey`          | Private key only |
| List all API keys                     | `GET /apikey`           | Private key only |
| Delete a specific API key             | `DELETE /apikey`        | Private key only |
| Delete all API keys                   | `DELETE /apikey/all`    | Private key only |
| Revoke all & issue a new key          | `POST /apikey/regenerate` | Private key only |

---

## Endpoints — Token Operations

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

### GET /balance — Wallet Balance

```bash
curl -H "x-api-key: API_KEY" https://api.shibclaw.xyz/balance
```
→ `{"success":true,"address":"0x...","balance":"5000"}`

### GET /transactions — Recent History

Returns the latest 20 transactions involving the caller (both sent and received).

```bash
curl -H "x-api-key: API_KEY" https://api.shibclaw.xyz/transactions
```
→ Array of objects with: `tx_id`, `from`, `to`, `amount`, `memo`,
`direction` (`"in"` | `"out"`), `timestamp`

### POST /transfer — Single Transfer

```bash
curl -X POST https://api.shibclaw.xyz/transfer \
  -H "Content-Type: application/json" \
  -H "x-api-key: API_KEY" \
  -d '{"to":"0xRecipient","amount":100}'
```
→ `{"success":true,"tx_id":"uuid","from":"0x...","to":"0x...","amount":"100"}`

### POST /transfer/batch — Batch Transfer

Max 100 recipients per request. Entire batch is atomic — all succeed or all fail.

```bash
curl -X POST https://api.shibclaw.xyz/transfer/batch \
  -H "Content-Type: application/json" \
  -H "x-api-key: API_KEY" \
  -d '{"transfers":[{"to":"0xAddr1","amount":500},{"to":"0xAddr2","amount":300}]}'
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
3. **No self-transfers** — sender and recipient cannot be the same address.
4. **Batch cap** — max 100 transfers per batch request.
5. **Supply cap** — total circulating supply can never exceed 100,000,000,000.

---

## Error Handling

All errors follow: `{"success":false,"error":"<message>"}`

| HTTP | Meaning                                              |
|------|------------------------------------------------------|
| 400  | Bad request: invalid address, insufficient balance, bad amount, self-transfer |
| 401  | Invalid or missing credentials (private key or API key) |
| 404  | Endpoint or API key not found                        |
| 429  | Rate limited (60/min)                                |
| 500  | Internal error                                       |

When any request fails, report the error message to the user. Never expose
internal server details, database info, or stack traces.

---

## Workflow

### Balance Inquiry

1. Obtain credentials (private key or API key from config/environment/user).
2. `GET /balance` with auth header.
3. Report address and balance to the user.

### Single Transfer

1. Obtain credentials.
2. Validate recipient address format (`0x` + 40 hex chars).
3. Optionally `GET /balance` to confirm sufficient funds.
4. `POST /transfer` with `{"to":"0x...","amount":N}`.
5. Report `tx_id` and final state to the user.

### Batch Transfer (Airdrop / Multi-tip)

1. Obtain credentials.
2. Validate all recipient addresses.
3. Sum total amount, `GET /balance` to confirm sufficient funds.
4. `POST /transfer/batch` with `{"transfers":[...]}`.
5. Report all `tx_id` values to the user.

### Transaction History

1. Obtain credentials.
2. `GET /transactions` with auth header.
3. Present as a formatted table: direction, counterparty, amount, timestamp.

### List / Query API Keys

1. Obtain the user's **private key** (API keys cannot query key lists).
2. `GET /apikey` with `x-private-key` header.
3. Present results as a table: masked key, label, created date, last used date.
4. If the user asks "show my API keys" or "do I have any keys?" — use this workflow.

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
```

### Transfer Confirmation

```
Transfer successful.
TX ID:   {tx_id}
From:    {from_address}
To:      {to_address}
Amount:  {amount} SHAI
```

### Transaction History Table

```
| Direction | Counterparty | Amount   | Time                |
|-----------|-------------|----------|---------------------|
| OUT       | 0xabc...    | 500 SHAI | 2026-04-12 14:55 UTC|
| IN        | 0xdef...    | 100 SHAI | 2026-04-12 13:20 UTC|
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
- When any endpoint fails: report the error message — never expose server internals
- This is an off-chain ledger system, not an on-chain smart contract
