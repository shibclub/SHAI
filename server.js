require("dotenv").config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ethers } = require('ethers');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const PORT = 3080;

const TOKEN_NAME = 'SHAI';
const MAX_SUPPLY = BigInt('100000000000');
const GENESIS_PRIVATE_KEY = process.env.GENESIS_PRIVATE_KEY;
if (!GENESIS_PRIVATE_KEY) throw new Error('GENESIS_PRIVATE_KEY not set');
const GENESIS_WALLET = new ethers.Wallet('0x' + GENESIS_PRIVATE_KEY);
const GENESIS_ADDRESS = GENESIS_WALLET.address.toLowerCase();

// --------------- Middleware ---------------
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '100kb' }));

// Remove server identity headers
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: false,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' }
});
app.use(limiter);

// --------------- Auth helper ---------------
function authenticateByPrivateKey(req) {
  const privateKey = req.headers['x-private-key'] || req.body?.private_key;
  if (!privateKey) return null;
  try {
    const cleaned = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
    const wallet = new ethers.Wallet(cleaned);
    return wallet.address.toLowerCase();
  } catch {
    return null;
  }
}

async function authenticateRequest(req) {
  const pkAddr = authenticateByPrivateKey(req);
  if (pkAddr) return pkAddr;
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    const addr = await db.resolveApiKey(apiKey);
    if (addr) return addr;
  }
  return null;
}

function isValidEvmAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

// --------------- Twitter helper ---------------
function isValidTwitterUsername(username) {
  return /^[a-zA-Z0-9_]{1,15}$/.test(username);
}

function isValidTweetUrl(url) {
  return /^https:\/\/(x\.com|twitter\.com)\/[a-zA-Z0-9_]+\/status\/\d+/.test(url);
}

function extractUsernameFromTweetUrl(url) {
  const match = url.match(/^https:\/\/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)\/status\/\d+/);
  return match ? match[1] : null;
}

// Resolve a "to" field that can be an EVM address, twitter username, or @username
async function resolveRecipient(to) {
  if (!to || typeof to !== 'string') return { error: 'Missing "to" field.' };
  const trimmed = to.trim();

  // Check if it's a valid EVM address
  if (isValidEvmAddress(trimmed)) {
    return { address: trimmed.toLowerCase() };
  }

  // Strip @ prefix if present
  const username = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;

  // Validate as twitter username
  if (!isValidTwitterUsername(username)) {
    return { error: 'Invalid recipient. Must be a valid EVM address or Twitter username.' };
  }

  // Resolve twitter username to address
  const resolved = await db.resolveTwitter(username.toLowerCase());
  if (!resolved) {
    return { error: 'Twitter account not verified or not bound to a wallet.' };
  }
  return { address: resolved.toLowerCase() };
}

// Resolve a query target (address or twitter username) to an address - for public lookups
async function resolveTarget(target) {
  if (!target || typeof target !== 'string') return null;
  const trimmed = target.trim();
  if (isValidEvmAddress(trimmed)) return trimmed.toLowerCase();
  const username = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  if (!isValidTwitterUsername(username)) return null;
  const resolved = await db.resolveTwitter(username.toLowerCase());
  return resolved ? resolved.toLowerCase() : null;
}

// --------------- Routes ---------------

// Health check
app.get('/', (req, res) => {
  res.json({ name: TOKEN_NAME, status: 'online' });
});

// Token info
app.get('/token', (req, res) => {
  res.json({
    name: TOKEN_NAME,
    max_supply: MAX_SUPPLY.toString(),
    decimals: 0,
    description: 'SHAI - A tipping token for AI agents'
  });
});

// Get balance - authenticated (own wallet)
app.get('/balance', async (req, res) => {
  try {
    const address = await authenticateRequest(req);
    if (!address) return res.status(401).json({ success: false, error: 'Invalid or missing credentials.' });
    const balance = await db.getBalance(address);
    res.json({ success: true, address, balance: balance.toString() });
  } catch (err) {
    console.error('Balance error:', err.message);
    res.status(500).json({ success: false, error: 'Internal error.' });
  }
});

// Get balance - public (query any address or twitter username)
app.get('/balance/:target', async (req, res) => {
  try {
    const address = await resolveTarget(req.params.target);
    if (!address) {
      return res.status(400).json({ success: false, error: 'Invalid address or unverified Twitter username.' });
    }
    const balance = await db.getBalance(address);
    const twitterBindings = await db.getAddressTwitterBindings(address);
    const response = { success: true, address, balance: balance.toString() };
    if (twitterBindings.length > 0) {
      response.twitter = twitterBindings.map(b => b.twitter_username);
    }
    res.json(response);
  } catch (err) {
    console.error('Public balance error:', err.message);
    res.status(500).json({ success: false, error: 'Internal error.' });
  }
});

// Get recent transactions - authenticated (own wallet)
app.get('/transactions', async (req, res) => {
  try {
    const address = await authenticateRequest(req);
    if (!address) return res.status(401).json({ success: false, error: 'Invalid or missing credentials.' });
    const rawLimit = parseInt(req.query.limit);
    const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 20 : rawLimit, 1), 100);
    const txs = await db.getRecentTransactions(address, limit);
    res.json({ success: true, address, transactions: txs });
  } catch (err) {
    console.error('Transactions error:', err.message);
    res.status(500).json({ success: false, error: 'Internal error.' });
  }
});

// Get recent transactions - public (query any address or twitter username)
app.get('/transactions/:target', async (req, res) => {
  try {
    const address = await resolveTarget(req.params.target);
    if (!address) {
      return res.status(400).json({ success: false, error: 'Invalid address or unverified Twitter username.' });
    }
    const rawLimit = parseInt(req.query.limit);
    const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 20 : rawLimit, 1), 100);
    const txs = await db.getRecentTransactions(address, limit);
    const twitterBindings = await db.getAddressTwitterBindings(address);
    const response = { success: true, address, transactions: txs };
    if (twitterBindings.length > 0) {
      response.twitter = twitterBindings.map(b => b.twitter_username);
    }
    res.json(response);
  } catch (err) {
    console.error('Public transactions error:', err.message);
    res.status(500).json({ success: false, error: 'Internal error.' });
  }
});

// Single transfer (supports EVM address or Twitter username as recipient)
app.post('/transfer', async (req, res) => {
  try {
    const address = await authenticateRequest(req);
    if (!address) return res.status(401).json({ success: false, error: 'Invalid or missing credentials.' });

    const { to, amount } = req.body;
    if (!to || amount === undefined) {
      return res.status(400).json({ success: false, error: 'Missing "to" or "amount" field.' });
    }

    const resolved = await resolveRecipient(to);
    if (resolved.error) {
      return res.status(400).json({ success: false, error: resolved.error });
    }
    const toAddr = resolved.address;

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount !== Math.floor(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be a positive integer.' });
    }
    const transferAmount = BigInt(parsedAmount);
    if (transferAmount <= 0n) {
      return res.status(400).json({ success: false, error: 'Amount must be a positive integer.' });
    }
    if (toAddr === address) {
      return res.status(400).json({ success: false, error: 'Cannot transfer to yourself.' });
    }

    const result = await db.transfer(address, toAddr, transferAmount);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('Transfer error:', err.message);
    res.status(500).json({ success: false, error: 'Internal error.' });
  }
});

// Batch transfer (supports EVM address or Twitter username as recipient)
app.post('/transfer/batch', async (req, res) => {
  try {
    const address = await authenticateRequest(req);
    if (!address) return res.status(401).json({ success: false, error: 'Invalid or missing credentials.' });

    const { transfers } = req.body;
    if (!Array.isArray(transfers) || transfers.length === 0) {
      return res.status(400).json({ success: false, error: 'Missing or empty "transfers" array.' });
    }
    if (transfers.length > 100) {
      return res.status(400).json({ success: false, error: 'Maximum 100 transfers per batch.' });
    }

    let totalAmount = 0n;
    const parsed = [];
    for (let i = 0; i < transfers.length; i++) {
      const t = transfers[i];
      if (!t.to || t.amount === undefined) {
        return res.status(400).json({ success: false, error: `Transfer #${i}: missing "to" or "amount".` });
      }

      const resolved = await resolveRecipient(t.to);
      if (resolved.error) {
        return res.status(400).json({ success: false, error: `Transfer #${i}: ${resolved.error}` });
      }
      const toAddr = resolved.address;

      const parsedAmt = Number(t.amount);
      if (!Number.isFinite(parsedAmt) || parsedAmt !== Math.floor(parsedAmt) || parsedAmt <= 0) {
        return res.status(400).json({ success: false, error: `Transfer #${i}: amount must be a positive integer.` });
      }
      const amt = BigInt(parsedAmt);
      if (amt <= 0n) {
        return res.status(400).json({ success: false, error: `Transfer #${i}: amount must be a positive integer.` });
      }
      if (toAddr === address) {
        return res.status(400).json({ success: false, error: `Transfer #${i}: cannot transfer to yourself.` });
      }
      totalAmount += amt;
      parsed.push({ to: toAddr, amount: amt });
    }

    const result = await db.batchTransfer(address, parsed, totalAmount);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('Batch transfer error:', err.message);
    res.status(500).json({ success: false, error: 'Internal error.' });
  }
});

// ============== Twitter Verification ==============

// POST /verify/twitter - Public endpoint to verify and bind a Twitter account
app.post('/verify/twitter', async (req, res) => {
  try {
    const { twitter_username, tweet_url } = req.body;

    if (!twitter_username || !tweet_url) {
      return res.status(400).json({ success: false, error: 'Missing "twitter_username" or "tweet_url" field.' });
    }

    // Validate twitter_username
    if (!isValidTwitterUsername(twitter_username)) {
      return res.status(400).json({ success: false, error: 'Invalid twitter_username. Must be 1-15 alphanumeric or underscore characters.' });
    }

    // Validate tweet_url
    if (!isValidTweetUrl(tweet_url)) {
      return res.status(400).json({ success: false, error: 'Invalid tweet_url. Must be a valid x.com or twitter.com status URL.' });
    }

    // Extract username from tweet URL and verify it matches
    const urlUsername = extractUsernameFromTweetUrl(tweet_url);
    if (!urlUsername || urlUsername.toLowerCase() !== twitter_username.toLowerCase()) {
      return res.status(400).json({ success: false, error: 'The twitter_username does not match the username in the tweet URL.' });
    }

    // Fetch tweet content via oEmbed API
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweet_url)}`;
    let oembedData;
    try {
      const response = await fetch(oembedUrl);
      if (!response.ok) {
        return res.status(400).json({ success: false, error: 'Failed to fetch tweet. Make sure the tweet exists and is public.' });
      }
      oembedData = await response.json();
    } catch (fetchErr) {
      console.error('oEmbed fetch error:', fetchErr.message);
      return res.status(400).json({ success: false, error: 'Failed to fetch tweet content from Twitter.' });
    }

    // Parse the HTML to extract tweet text from <p> tags
    const html = oembedData.html || '';
    const pTagMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (!pTagMatch) {
      return res.status(400).json({ success: false, error: 'Could not parse tweet content.' });
    }

    // Strip HTML tags from the extracted text
    const tweetText = pTagMatch[1].replace(/<[^>]*>/g, '').trim();

    // Look for ShibClaw pattern
    const shibclawMatch = tweetText.match(/shibclaw(0x[0-9a-fA-F]{40})/i);
    if (!shibclawMatch) {
      return res.status(400).json({ success: false, error: 'Tweet does not contain a valid ShibClaw address pattern. Expected format: ShibClaw0xYourAddressHere' });
    }

    const boundAddress = shibclawMatch[1].toLowerCase();
    const normalizedUsername = twitter_username.toLowerCase();

    // Bind the twitter username to the address
    await db.bindTwitter(normalizedUsername, boundAddress, tweet_url);

    res.json({
      success: true,
      twitter_username: normalizedUsername,
      address: boundAddress,
      message: 'Twitter account verified and bound to wallet.'
    });
  } catch (err) {
    console.error('Twitter verify error:', err.message);
    res.status(500).json({ success: false, error: 'Internal error.' });
  }
});

// GET /twitter/:username - Public endpoint to get address for a twitter username
app.get('/twitter/:username', async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    if (!isValidTwitterUsername(username)) {
      return res.status(400).json({ success: false, error: 'Invalid twitter username.' });
    }
    const address = await db.resolveTwitter(username);
    if (!address) {
      return res.status(404).json({ success: false, error: 'Twitter account not found or not verified.' });
    }
    res.json({ success: true, twitter_username: username, address });
  } catch (err) {
    console.error('Twitter lookup error:', err.message);
    res.status(500).json({ success: false, error: 'Internal error.' });
  }
});

// GET /address/:address/twitter - Public endpoint to get twitter username(s) for an address
app.get('/address/:address/twitter', async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    if (!isValidEvmAddress(req.params.address)) {
      return res.status(400).json({ success: false, error: 'Invalid EVM address.' });
    }
    const bindings = await db.getAddressTwitterBindings(address);
    res.json({
      success: true,
      address,
      twitter_usernames: bindings.map(b => ({
        twitter_username: b.twitter_username,
        tweet_url: b.tweet_url,
        verified_at: b.verified_at
      }))
    });
  } catch (err) {
    console.error('Address twitter lookup error:', err.message);
    res.status(500).json({ success: false, error: 'Internal error.' });
  }
});

// ============== API Key Management (private key ONLY) ==============

app.post('/apikey', async (req, res) => {
  try {
    const address = authenticateByPrivateKey(req);
    if (!address) return res.status(401).json({ success: false, error: 'Private key required to manage API keys.' });
    const { label } = req.body || {};
    const apiKey = await db.createApiKey(address, label);
    res.json({ success: true, address, api_key: apiKey, label: label || null });
  } catch (err) {
    console.error('Create API key error:', err.message);
    res.status(500).json({ success: false, error: 'Internal error.' });
  }
});

app.get('/apikey', async (req, res) => {
  try {
    const address = authenticateByPrivateKey(req);
    if (!address) return res.status(401).json({ success: false, error: 'Private key required to manage API keys.' });
    const keys = await db.listApiKeys(address);
    res.json({
      success: true,
      address,
      api_keys: keys.map(k => ({
        api_key: k.api_key,
        label: k.label,
        created_at: k.created_at,
        last_used_at: k.last_used_at
      }))
    });
  } catch (err) {
    console.error('List API keys error:', err.message);
    res.status(500).json({ success: false, error: 'Internal error.' });
  }
});

app.delete('/apikey', async (req, res) => {
  try {
    const address = authenticateByPrivateKey(req);
    if (!address) return res.status(401).json({ success: false, error: 'Private key required to manage API keys.' });
    const { api_key } = req.body || {};
    if (!api_key) {
      return res.status(400).json({ success: false, error: 'Missing "api_key" field.' });
    }
    const deleted = await db.deleteApiKey(address, api_key);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'API key not found or does not belong to you.' });
    }
    res.json({ success: true, message: 'API key deleted.' });
  } catch (err) {
    console.error('Delete API key error:', err.message);
    res.status(500).json({ success: false, error: 'Internal error.' });
  }
});

app.delete('/apikey/all', async (req, res) => {
  try {
    const address = authenticateByPrivateKey(req);
    if (!address) return res.status(401).json({ success: false, error: 'Private key required to manage API keys.' });
    const count = await db.deleteAllApiKeys(address);
    res.json({ success: true, message: `${count} API key(s) deleted.` });
  } catch (err) {
    console.error('Delete all API keys error:', err.message);
    res.status(500).json({ success: false, error: 'Internal error.' });
  }
});

app.post('/apikey/regenerate', async (req, res) => {
  try {
    const address = authenticateByPrivateKey(req);
    if (!address) return res.status(401).json({ success: false, error: 'Private key required to manage API keys.' });
    const { label } = req.body || {};
    const apiKey = await db.regenerateApiKey(address, label);
    res.json({ success: true, address, api_key: apiKey, label: label || null, message: 'All previous keys revoked. New key issued.' });
  } catch (err) {
    console.error('Regenerate API key error:', err.message);
    res.status(500).json({ success: false, error: 'Internal error.' });
  }
});

// Catch-all
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found.' });
});

// --------------- Init & Start ---------------
async function init() {
  await db.initialize(GENESIS_ADDRESS, MAX_SUPPLY);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SHAI API running on port ${PORT}`);
  });
}

init().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
