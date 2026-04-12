# SHAI Token

**SHAI** is a tipping token designed for AI-to-AI agent transactions. It provides a simple REST API for balance queries, transfers, transaction history, and delegated API key access — no blockchain node required.

- **Token Name:** SHAI
- **Max Supply:** 100,000,000,000 (100 billion)
- **Decimals:** 0 (integer-only transfers)
- **Address Format:** EVM-compatible (Ethereum-style `0x...` addresses)
- **Authentication:** Ethereum private key or API key

---

## Base URL

```
https://api.shibclaw.xyz/
```

---

## Authentication

Two methods are supported. Both identify the caller's wallet address.

### Private Key (full access)

Required for API key management. Works on all endpoints.

```
x-private-key: <your_64_hex_char_private_key>
```

The `0x` prefix is optional. The server derives your wallet address on each request — **private keys are never stored**.

### API Key (delegated access)

Created via private key. Works on balance, transactions, transfer, and batch transfer endpoints. Ideal for bots and third-party integrations that should not hold the raw private key.

```
x-api-key: shai_<64_hex_chars>
```

If both headers are present, private key takes priority.

---

## Endpoints

### `GET /` — Health Check

No authentication required.

```bash
curl https://api.shibclaw.xyz/
```

```json
{ "name": "SHAI", "status": "online" }
```

### `GET /token` — Token Info

No authentication required.

```bash
curl https://api.shibclaw.xyz/token
```

```json
{
  "name": "SHAI",
  "max_supply": "100000000000",
  "decimals": 0,
  "description": "SHAI - A tipping token for AI agents"
}
```

### `GET /balance` — Query Balance

Auth: private key or API key.

```bash
curl -H "x-api-key: YOUR_API_KEY" https://api.shibclaw.xyz/balance
```

```json
{ "success": true, "address": "0x...", "balance": "1000" }
```

### `GET /transactions` — Recent Transactions

Auth: private key or API key. Returns the latest 20 transactions (both sent and received).

```bash
curl -H "x-api-key: YOUR_API_KEY" https://api.shibclaw.xyz/transactions
```

```json
{
  "success": true,
  "address": "0x...",
  "transactions": [
    {
      "tx_id": "uuid",
      "from": "0x...",
      "to": "0x...",
      "amount": "100",
      "memo": null,
      "direction": "out",
      "timestamp": "2026-04-12T14:55:50.000Z"
    }
  ]
}
```

### `POST /transfer` — Single Transfer

Auth: private key or API key.

```bash
curl -X POST https://api.shibclaw.xyz/transfer \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"to": "0xRecipientAddress", "amount": 100}'
```

```json
{ "success": true, "tx_id": "uuid", "from": "0x...", "to": "0x...", "amount": "100" }
```

### `POST /transfer/batch` — Batch Transfer

Auth: private key or API key. Max 100 recipients per batch. Atomic — all succeed or all fail.

```bash
curl -X POST https://api.shibclaw.xyz/transfer/batch \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"transfers": [{"to": "0xAddr1", "amount": 500}, {"to": "0xAddr2", "amount": 300}]}'
```

```json
{
  "success": true,
  "from": "0x...",
  "transfers": [
    { "tx_id": "uuid1", "to": "0xAddr1", "amount": "500" },
    { "tx_id": "uuid2", "to": "0xAddr2", "amount": "300" }
  ]
}
```

---

## API Key Management

All key management endpoints require `x-private-key`. API keys cannot manage themselves.

### `POST /apikey` — Create API Key

```bash
curl -X POST https://api.shibclaw.xyz/apikey \
  -H "Content-Type: application/json" \
  -H "x-private-key: YOUR_PRIVATE_KEY" \
  -d '{"label": "red-packet-bot"}'
```

```json
{ "success": true, "address": "0x...", "api_key": "shai_...", "label": "red-packet-bot" }
```

The `label` field is optional. A wallet can have multiple API keys.

### `GET /apikey` — List API Keys

```bash
curl -H "x-private-key: YOUR_PRIVATE_KEY" https://api.shibclaw.xyz/apikey
```

Returns masked keys with label, created_at, and last_used_at.

### `DELETE /apikey` — Delete Specific Key

```bash
curl -X DELETE https://api.shibclaw.xyz/apikey \
  -H "Content-Type: application/json" \
  -H "x-private-key: YOUR_PRIVATE_KEY" \
  -d '{"api_key": "shai_full_key_here"}'
```

### `DELETE /apikey/all` — Delete All Keys

```bash
curl -X DELETE https://api.shibclaw.xyz/apikey/all \
  -H "x-private-key: YOUR_PRIVATE_KEY"
```

### `POST /apikey/regenerate` — Revoke All & Issue New

Atomically deletes all existing keys and creates one new key.

```bash
curl -X POST https://api.shibclaw.xyz/apikey/regenerate \
  -H "Content-Type: application/json" \
  -H "x-private-key: YOUR_PRIVATE_KEY" \
  -d '{"label": "new-bot"}'
```

```json
{
  "success": true,
  "address": "0x...",
  "api_key": "shai_...",
  "label": "new-bot",
  "message": "All previous keys revoked. New key issued."
}
```

---

## Error Responses

All errors return a consistent format:

```json
{ "success": false, "error": "Error description." }
```

| HTTP Code | Meaning |
|-----------|---------|
| 400 | Bad request (invalid address, insufficient balance, etc.) |
| 401 | Invalid or missing credentials |
| 404 | Endpoint or API key not found |
| 429 | Rate limit exceeded (60 requests/min per IP) |
| 500 | Internal error |

---

## Rules

1. **Integer-only** — All amounts must be positive integers. No decimals.
2. **EVM addresses only** — Must be valid `0x` + 40 hex character Ethereum addresses.
3. **No self-transfers** — You cannot send tokens to yourself.
4. **Max supply is hard-capped** — The total supply of 100,000,000,000 SHAI can never be exceeded.
5. **Rate limited** — 60 requests per minute per IP address.

---

## For AI Agent Integration

Add this to your AI agent's system prompt or tool config:

```
You can send and receive SHAI tokens via the API at https://api.shibclaw.xyz/

Authentication (use one):
- x-private-key: <private_key>  (full access)
- x-api-key: <api_key>          (delegated access, recommended for bots)

Available actions:
- GET /balance → check your SHAI balance
- GET /transactions → view your last 20 transactions
- POST /transfer → send SHAI: {"to": "0x...", "amount": integer}
- POST /transfer/batch → batch send: {"transfers": [{"to": "0x...", "amount": integer}, ...]}

API key management (private key only):
- POST /apikey → create a new API key: {"label": "my-bot"}
- GET /apikey → list your API keys
- DELETE /apikey → delete a key: {"api_key": "shai_..."}
- POST /apikey/regenerate → revoke all keys & create new one

Rules: amounts are integers only, addresses must be valid EVM format (0x + 40 hex chars).
```

---

## License

MIT
