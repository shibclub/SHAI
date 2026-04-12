---
name: shai-token
description: "SHAI Token API integration for AI agent tipping and transfers. Use this skill when the user wants to send, receive, or check balance of SHAI tokens, or query transaction history. Triggers include: send SHAI, transfer SHAI, tip SHAI, SHAI balance, SHAI transactions, SHAI history, AI agent tipping, send tokens to address, batch transfer SHAI."
---

# SHAI Token API Skill

SHAI is a tipping token for AI agents. It uses a centralized REST API with EVM-style wallet addresses and Ethereum private key authentication.

## Key Facts

- **Token:** SHAI
- **Max Supply:** 100,000,000,000 (hard cap, integer only, no decimals)
- **Address Format:** EVM (Ethereum `0x` + 40 hex chars)
- **Auth:** Ethereum private key via `x-private-key` HTTP header
- **Base URL:** `https://api.shibclaw.xyz`

## Authentication

Every authenticated request must include the private key as an HTTP header:

```
x-private-key: <64_hex_char_private_key>
```

The `0x` prefix is optional. The server derives the wallet address from the private key on each request. Private keys are never stored server-side.

## Endpoints

### GET / — Health Check (no auth)

```bash
curl https://api.shibclaw.xyz/
```

Response: `{"name":"SHAI","status":"online"}`

### GET /token — Token Info (no auth)

```bash
curl https://api.shibclaw.xyz/token
```

Response: `{"name":"SHAI","max_supply":"100000000000","decimals":0,"description":"SHAI - A tipping token for AI agents"}`

### GET /balance — Query Balance (auth required)

```bash
curl -H "x-private-key: PRIVATE_KEY" https://api.shibclaw.xyz/balance
```

Response: `{"success":true,"address":"0x...","balance":"1000"}`

### GET /transactions — Last 20 Transactions (auth required)

```bash
curl -H "x-private-key: PRIVATE_KEY" https://api.shibclaw.xyz/transactions
```

Response includes `tx_id`, `from`, `to`, `amount`, `memo`, `direction` ("in"/"out"), `timestamp`.

### POST /transfer — Single Transfer (auth required)

```bash
curl -X POST https://api.shibclaw.xyz/transfer \
  -H "Content-Type: application/json" \
  -H "x-private-key: PRIVATE_KEY" \
  -d '{"to":"0xRecipientAddress","amount":100}'
```

Response: `{"success":true,"tx_id":"uuid","from":"0x...","to":"0x...","amount":"100"}`

### POST /transfer/batch — Batch Transfer (auth required, max 100)

```bash
curl -X POST https://api.shibclaw.xyz/transfer/batch \
  -H "Content-Type: application/json" \
  -H "x-private-key: PRIVATE_KEY" \
  -d '{"transfers":[{"to":"0xAddr1","amount":500},{"to":"0xAddr2","amount":300}]}'
```

Response: `{"success":true,"from":"0x...","transfers":[{"tx_id":"uuid","to":"0x...","amount":"500"},...]}`

## Rules

1. Amounts must be **positive integers** — no decimals.
2. Addresses must be valid EVM format: `0x` + 40 hex characters.
3. Self-transfers are not allowed.
4. Max 100 transfers per batch request.
5. Rate limit: 60 requests/min per IP.

## Error Handling

All errors: `{"success":false,"error":"message"}`

| Code | Meaning |
|------|---------|
| 401  | Invalid/missing private key |
| 400  | Bad request (invalid address, insufficient balance, bad amount) |
| 404  | Endpoint not found |
| 429  | Rate limited |
| 500  | Internal error |

## Workflow

When the user asks to perform a SHAI operation:

1. Ensure you have the user's private key (from config, environment, or ask the user).
2. For **balance check**: `GET /balance` with `x-private-key` header.
3. For **transaction history**: `GET /transactions` with `x-private-key` header.
4. For **single transfer**: `POST /transfer` with `{"to":"0x...","amount":N}`.
5. For **batch transfer**: `POST /transfer/batch` with `{"transfers":[...]}`.
6. Always validate the address format before sending.
7. Always check balance before large transfers.
8. Report the `tx_id` back to the user on success.
