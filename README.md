# SHAI Token

**SHAI** is a tipping token designed for AI-to-AI agent transactions. It provides a simple REST API for balance queries, transfers, and transaction history — no blockchain node required.

- **Token Name:** SHAI
- **Max Supply:** 100,000,000,000 (100 billion)
- **Decimals:** 0 (integer-only transfers)
- **Address Format:** EVM-compatible (Ethereum-style `0x...` addresses)
- **Authentication:** Ethereum private key

---

## Base URL

```
https://api.shibclaw.xyz/
```

---

## Authentication

All authenticated endpoints require an Ethereum private key passed via the `x-private-key` HTTP header. The server derives your wallet address from the private key on every request — **private keys are never stored**.

```
x-private-key: <your_64_hex_char_private_key>
```

The `0x` prefix is optional.

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

```bash
curl -H "x-private-key: YOUR_PRIVATE_KEY" \
  https://api.shibclaw.xyz/balance
```

```json
{
  "success": true,
  "address": "0x...",
  "balance": "1000"
}
```

### `GET /transactions` — Recent Transactions

Returns the latest 20 transactions (both sent and received).

```bash
curl -H "x-private-key: YOUR_PRIVATE_KEY" \
  https://api.shibclaw.xyz/transactions
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

```bash
curl -X POST https://api.shibclaw.xyz/transfer \
  -H "Content-Type: application/json" \
  -H "x-private-key: YOUR_PRIVATE_KEY" \
  -d '{"to": "0xRecipientAddress", "amount": 100}'
```

```json
{
  "success": true,
  "tx_id": "uuid",
  "from": "0x...",
  "to": "0x...",
  "amount": "100"
}
```

### `POST /transfer/batch` — Batch Transfer

Send to multiple recipients in a single request (max 100 per batch).

```bash
curl -X POST https://api.shibclaw.xyz/transfer/batch \
  -H "Content-Type: application/json" \
  -H "x-private-key: YOUR_PRIVATE_KEY" \
  -d '{
    "transfers": [
      {"to": "0xAddress1", "amount": 500},
      {"to": "0xAddress2", "amount": 300}
    ]
  }'
```

```json
{
  "success": true,
  "from": "0x...",
  "transfers": [
    { "tx_id": "uuid1", "to": "0xAddress1", "amount": "500" },
    { "tx_id": "uuid2", "to": "0xAddress2", "amount": "300" }
  ]
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
| 401 | Invalid or missing private key |
| 400 | Bad request (invalid address, insufficient balance, etc.) |
| 404 | Endpoint not found |
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

To authenticate, include the header: x-private-key: <private_key>

Available actions:
- GET /balance → check your SHAI balance
- GET /transactions → view your last 20 transactions
- POST /transfer → send SHAI: {"to": "0x...", "amount": integer}
- POST /transfer/batch → batch send: {"transfers": [{"to": "0x...", "amount": integer}, ...]}

Rules: amounts are integers only, addresses must be valid EVM format (0x + 40 hex chars).
```

---

## License

MIT
