# SHAI 代币

**SHAI** 是一个专为 AI 代理之间打赏和转账设计的代币。它提供简洁的 REST API，支持余额查询、单笔/批量转账和交易记录 — 无需区块链节点。

- **代币名称：** SHAI
- **最大供应量：** 100,000,000,000（1000 亿）
- **小数位：** 0（只支持整数转账）
- **地址格式：** EVM 兼容（以太坊 `0x...` 格式）
- **认证方式：** 以太坊私钥

---

## 接口地址

```
https://api.shibclaw.xyz/
```

---

## 认证方式

所有需要认证的接口，必须通过 HTTP Header 传入以太坊私钥。服务端每次请求时从私钥派生钱包地址 — **私钥不会被存储**。

```
x-private-key: <你的64位十六进制私钥>
```

`0x` 前缀可加可不加。

---

## 接口列表

### `GET /` — 健康检查

无需认证。

```bash
curl https://api.shibclaw.xyz/
```

```json
{ "name": "SHAI", "status": "online" }
```

### `GET /token` — 代币信息

无需认证。

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

### `GET /balance` — 查询余额

```bash
curl -H "x-private-key: 你的私钥" \
  https://api.shibclaw.xyz/balance
```

```json
{
  "success": true,
  "address": "0x...",
  "balance": "1000"
}
```

### `GET /transactions` — 最近交易记录

返回最近 20 条交易记录（包括转入和转出）。

```bash
curl -H "x-private-key: 你的私钥" \
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

### `POST /transfer` — 单笔转账

```bash
curl -X POST https://api.shibclaw.xyz/transfer \
  -H "Content-Type: application/json" \
  -H "x-private-key: 你的私钥" \
  -d '{"to": "0x收款地址", "amount": 100}'
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

### `POST /transfer/batch` — 批量转账

单次最多 100 笔。

```bash
curl -X POST https://api.shibclaw.xyz/transfer/batch \
  -H "Content-Type: application/json" \
  -H "x-private-key: 你的私钥" \
  -d '{
    "transfers": [
      {"to": "0x地址1", "amount": 500},
      {"to": "0x地址2", "amount": 300}
    ]
  }'
```

```json
{
  "success": true,
  "from": "0x...",
  "transfers": [
    { "tx_id": "uuid1", "to": "0x地址1", "amount": "500" },
    { "tx_id": "uuid2", "to": "0x地址2", "amount": "300" }
  ]
}
```

---

## 错误响应

所有错误返回统一格式：

```json
{ "success": false, "error": "错误描述" }
```

| HTTP 状态码 | 含义 |
|-------------|------|
| 401 | 私钥无效或缺失 |
| 400 | 请求错误（地址无效、余额不足等） |
| 404 | 接口不存在 |
| 429 | 请求频率超限（每 IP 每分钟 60 次） |
| 500 | 内部错误 |

---

## 规则

1. **只支持整数** — 转账金额必须是正整数，不支持小数。
2. **仅限 EVM 地址** — 必须是 `0x` + 40 位十六进制字符的以太坊地址。
3. **不能自转** — 不能给自己转账。
4. **供应量硬上限** — SHAI 总供应量 1000 亿，永远不可能超发。
5. **频率限制** — 每个 IP 每分钟最多 60 次请求。

---

## AI 代理接入指南

把以下内容添加到你的 AI 代理的系统提示（System Prompt）或工具配置中：

```
你可以通过 API https://api.shibclaw.xyz/ 收发 SHAI 代币。

认证方式：在 HTTP Header 中添加 x-private-key: <私钥>

可用操作：
- GET /balance → 查询 SHAI 余额
- GET /transactions → 查看最近 20 条交易记录
- POST /transfer → 转账：{"to": "0x...", "amount": 整数}
- POST /transfer/batch → 批量转账：{"transfers": [{"to": "0x...", "amount": 整数}, ...]}

规则：金额只能是整数，地址必须是 EVM 格式（0x + 40位十六进制）。
```

---

## 许可证

MIT
