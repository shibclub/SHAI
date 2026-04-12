---
name: shai-token
description: >
  SHAI token API — a lightweight tipping and transfer layer for AI agents.
  Use this skill whenever the user wants to interact with SHAI tokens: check
  balance, view transaction history, send single or batch transfers, or query
  token metadata. Triggers include: send SHAI, transfer SHAI, tip SHAI, SHAI
  balance, SHAI transactions, SHAI history, batch tip, airdrop SHAI, pay agent,
  reward agent, how much SHAI do I have, send tokens to 0x address, SHAI token
  info, agent-to-agent payment. Also triggers for casual phrasing like "tip
  that agent 100 SHAI", "check my SHAI wallet", "send tokens to 0x...",
  "how's my SHAI balance?", "airdrop to these addresses".
---

# SHAI Token Skill

SHAI is a tipping token purpose-built for AI agent economies. It provides a
centralized ledger with EVM-compatible addressing and private-key authentication
— no blockchain node, no gas fees, instant finality.

## Protocol Summary

| Property       | Value                          |
|----------------|--------------------------------|
| Token          | SHAI                           |
| Max Supply     | 100,000,000,000 (hard cap)     |
| Decimals       | 0 (integer-only)               |
| Address Format | EVM (`0x` + 40 hex characters) |
| Auth Method    | Ethereum private key           |
| Base URL       | `https://api.shibclaw.xyz`     |
| Rate Limit     | 60 req/min per IP              |

---

## Authentication

Every authenticated request requires an Ethereum private key in the HTTP header.
The server derives the caller's wallet address from the key on each request.
**Private keys are never stored server-side.**

```
x-private-key: <64_hex_char_private_key>
```

The `0x` prefix is optional. If the key is invalid or missing, all authenticated
endpoints return `401`.

---

## Quick Decision Tree

| User wants to…                        | Endpoint              | Auth |
|---------------------------------------|-----------------------|------|
| Check if API is alive                 | `GET /`               | No   |
| Get token metadata                    | `GET /token`          | No   |
| Check their SHAI balance              | `GET /balance`        | Yes  |
| View recent transactions (in & out)   | `GET /transactions`   | Yes  |
| Send SHAI to one address              | `POST /transfer`      | Yes  |
| Send SHAI to multiple addresses       | `POST /transfer/batch`| Yes  |

When a query spans check + transfer (e.g., "do I have enough to tip 500?"),
run balance check first, then transfer if sufficient.

---

## Endpoints

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

### GET /balance — Wallet Balance (auth required)

```bash
curl -H "x-private-key: KEY" https://api.shibclaw.xyz/balance
```
→ `{"success":true,"address":"0x...","balance":"5000"}`

### GET /transactions — Recent History (auth required)

Returns the latest 20 transactions involving the caller (both sent and received).

```bash
curl -H "x-private-key: KEY" https://api.shibclaw.xyz/transactions
```
→ Array of objects with: `tx_id`, `from`, `to`, `amount`, `memo`,
`direction` (`"in"` | `"out"`), `timestamp`

### POST /transfer — Single Transfer (auth required)

```bash
curl -X POST https://api.shibclaw.xyz/transfer \
  -H "Content-Type: application/json" \
  -H "x-private-key: KEY" \
  -d '{"to":"0xRecipient","amount":100}'
```
→ `{"success":true,"tx_id":"uuid","from":"0x...","to":"0x...","amount":"100"}`

### POST /transfer/batch — Batch Transfer (auth required)

Max 100 recipients per request. Entire batch is atomic — all succeed or all fail.

```bash
curl -X POST https://api.shibclaw.xyz/transfer/batch \
  -H "Content-Type: application/json" \
  -H "x-private-key: KEY" \
  -d '{"transfers":[{"to":"0xAddr1","amount":500},{"to":"0xAddr2","amount":300}]}'
```
→ `{"success":true,"from":"0x...","transfers":[{"tx_id":"uuid","to":"0x...","amount":"500"},...]}`

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
| 401  | Invalid or missing private key                       |
| 404  | Endpoint not found                                   |
| 429  | Rate limited (60/min)                                |
| 500  | Internal error                                       |

When any request fails, report the error message to the user. Never expose
internal server details, database info, or stack traces.

---

## Workflow

### Balance Inquiry

1. Obtain the user's private key (from environment config, session context, or ask).
2. `GET /balance` with `x-private-key` header.
3. Report address and balance to the user.

### Single Transfer

1. Obtain private key.
2. Validate recipient address format (`0x` + 40 hex chars).
3. Optionally `GET /balance` to confirm sufficient funds.
4. `POST /transfer` with `{"to":"0x...","amount":N}`.
5. Report `tx_id` and final state to the user.

### Batch Transfer (Airdrop / Multi-tip)

1. Obtain private key.
2. Validate all recipient addresses.
3. Sum total amount, `GET /balance` to confirm sufficient funds.
4. `POST /transfer/batch` with `{"transfers":[...]}`.
5. Report all `tx_id` values to the user.

### Transaction History

1. Obtain private key.
2. `GET /transactions` with `x-private-key` header.
3. Present as a formatted table: direction, counterparty, amount, timestamp.

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

---

## Notes

- Private keys authenticate identity — treat them as secrets, never log or echo them
- All transfers are atomic with database-level transaction isolation
- New wallets are auto-created on first incoming transfer (zero-balance until funded)
- The API is rate-limited to 60 requests per minute per IP
- When any endpoint fails: report the error message — never expose server internals
- This is an off-chain ledger system, not an on-chain smart contract
