require("dotenv").config();
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

function generateApiKey() {
  return 'shai_' + crypto.randomBytes(32).toString('hex');
}

async function initialize(genesisAddress, maxSupply) {
  const conn = await pool.getConnection();
  try {
    // Create wallets table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS shai_wallets (
        address VARCHAR(42) NOT NULL PRIMARY KEY,
        balance BIGINT UNSIGNED NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Create transactions table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS shai_transactions (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        from_address VARCHAR(42) NOT NULL,
        to_address VARCHAR(42) NOT NULL,
        amount BIGINT UNSIGNED NOT NULL,
        memo VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_from (from_address, created_at),
        INDEX idx_to (to_address, created_at),
        INDEX idx_time (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Create API keys table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS shai_api_keys (
        api_key VARCHAR(69) NOT NULL PRIMARY KEY,
        address VARCHAR(42) NOT NULL,
        label VARCHAR(100) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP NULL DEFAULT NULL,
        INDEX idx_address (address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Create Twitter bindings table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS shai_twitter_bindings (
        twitter_username VARCHAR(50) NOT NULL PRIMARY KEY,
        address VARCHAR(42) NOT NULL,
        tweet_url VARCHAR(500) NOT NULL,
        verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_address (address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Initialize genesis wallet if not exists
    const [rows] = await conn.execute('SELECT balance FROM shai_wallets WHERE address = ?', [genesisAddress]);
    if (rows.length === 0) {
      await conn.execute(
        'INSERT INTO shai_wallets (address, balance) VALUES (?, ?)',
        [genesisAddress, maxSupply.toString()]
      );
      console.log(`Genesis wallet initialized: ${genesisAddress} with ${maxSupply} SHAI`);
    } else {
      console.log(`Genesis wallet exists: ${genesisAddress}, balance: ${rows[0].balance}`);
    }
  } finally {
    conn.release();
  }
}

// --------------- API Key methods ---------------

async function resolveApiKey(apiKey) {
  const [rows] = await pool.execute(
    'SELECT address FROM shai_api_keys WHERE api_key = ?',
    [apiKey]
  );
  if (rows.length === 0) return null;
  // Update last_used_at (fire and forget)
  pool.execute('UPDATE shai_api_keys SET last_used_at = NOW() WHERE api_key = ?', [apiKey]).catch(() => {});
  return rows[0].address;
}

async function createApiKey(address, label) {
  const key = generateApiKey();
  await pool.execute(
    'INSERT INTO shai_api_keys (api_key, address, label) VALUES (?, ?, ?)',
    [key, address, label || null]
  );
  return key;
}

async function listApiKeys(address) {
  const [rows] = await pool.execute(
    'SELECT api_key, label, created_at, last_used_at FROM shai_api_keys WHERE address = ? ORDER BY created_at DESC',
    [address]
  );
  return rows.map(r => ({
    api_key: r.api_key.slice(0, 12) + '...' + r.api_key.slice(-4),
    label: r.label,
    created_at: r.created_at,
    last_used_at: r.last_used_at
  }));
}

async function deleteApiKey(address, apiKey) {
  const [result] = await pool.execute(
    'DELETE FROM shai_api_keys WHERE api_key = ? AND address = ?',
    [apiKey, address]
  );
  return result.affectedRows > 0;
}

async function deleteAllApiKeys(address) {
  const [result] = await pool.execute(
    'DELETE FROM shai_api_keys WHERE address = ?',
    [address]
  );
  return result.affectedRows;
}

async function regenerateApiKey(address, label) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM shai_api_keys WHERE address = ?', [address]);
    const key = generateApiKey();
    await conn.execute(
      'INSERT INTO shai_api_keys (api_key, address, label) VALUES (?, ?, ?)',
      [key, address, label || null]
    );
    await conn.commit();
    return key;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function getBalance(address) {
  const [rows] = await pool.execute('SELECT balance FROM shai_wallets WHERE address = ?', [address]);
  if (rows.length === 0) return 0n;
  return BigInt(rows[0].balance);
}

async function getRecentTransactions(address, limit = 20) {
  const [rows] = await pool.execute(
    `SELECT id, from_address, to_address, amount, memo, created_at
     FROM shai_transactions
     WHERE from_address = ? OR to_address = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [address, address, limit]
  );
  return rows.map(r => ({
    tx_id: r.id,
    from: r.from_address,
    to: r.to_address,
    amount: r.amount.toString(),
    memo: r.memo || null,
    direction: r.from_address === address ? 'out' : 'in',
    timestamp: r.created_at
  }));
}

async function transfer(from, to, amount) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock sender row
    const [senderRows] = await conn.execute(
      'SELECT balance FROM shai_wallets WHERE address = ? FOR UPDATE',
      [from]
    );
    if (senderRows.length === 0) {
      await conn.rollback();
      return { success: false, error: 'Sender wallet not found or has zero balance.' };
    }
    const senderBalance = BigInt(senderRows[0].balance);
    if (senderBalance < amount) {
      await conn.rollback();
      return { success: false, error: 'Insufficient balance.' };
    }

    // Deduct from sender
    await conn.execute(
      'UPDATE shai_wallets SET balance = balance - ? WHERE address = ?',
      [amount.toString(), from]
    );

    // Credit to receiver (upsert)
    await conn.execute(
      'INSERT INTO shai_wallets (address, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = balance + ?',
      [to, amount.toString(), amount.toString()]
    );

    // Record transaction
    const txId = uuidv4();
    await conn.execute(
      'INSERT INTO shai_transactions (id, from_address, to_address, amount) VALUES (?, ?, ?, ?)',
      [txId, from, to, amount.toString()]
    );

    await conn.commit();
    return {
      success: true,
      tx_id: txId,
      from,
      to,
      amount: amount.toString()
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function batchTransfer(from, transfers, totalAmount) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock sender row
    const [senderRows] = await conn.execute(
      'SELECT balance FROM shai_wallets WHERE address = ? FOR UPDATE',
      [from]
    );
    if (senderRows.length === 0) {
      await conn.rollback();
      return { success: false, error: 'Sender wallet not found or has zero balance.' };
    }
    const senderBalance = BigInt(senderRows[0].balance);
    if (senderBalance < totalAmount) {
      await conn.rollback();
      return { success: false, error: `Insufficient balance. Need ${totalAmount}, have ${senderBalance}.` };
    }

    // Deduct total from sender
    await conn.execute(
      'UPDATE shai_wallets SET balance = balance - ? WHERE address = ?',
      [totalAmount.toString(), from]
    );

    const results = [];
    for (const t of transfers) {
      // Credit receiver
      await conn.execute(
        'INSERT INTO shai_wallets (address, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = balance + ?',
        [t.to, t.amount.toString(), t.amount.toString()]
      );

      const txId = uuidv4();
      await conn.execute(
        'INSERT INTO shai_transactions (id, from_address, to_address, amount) VALUES (?, ?, ?, ?)',
        [txId, from, t.to, t.amount.toString()]
      );
      results.push({ tx_id: txId, to: t.to, amount: t.amount.toString() });
    }

    await conn.commit();
    return { success: true, from, transfers: results };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// --------------- Twitter binding methods ---------------

async function bindTwitter(twitterUsername, address, tweetUrl) {
  await pool.execute(
    `INSERT INTO shai_twitter_bindings (twitter_username, address, tweet_url, verified_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE address = VALUES(address), tweet_url = VALUES(tweet_url), verified_at = NOW()`,
    [twitterUsername, address, tweetUrl]
  );
}

async function resolveTwitter(twitterUsername) {
  const [rows] = await pool.execute(
    'SELECT address FROM shai_twitter_bindings WHERE twitter_username = ?',
    [twitterUsername]
  );
  if (rows.length === 0) return null;
  return rows[0].address;
}

async function getTwitterByAddress(address) {
  const [rows] = await pool.execute(
    'SELECT twitter_username FROM shai_twitter_bindings WHERE address = ? LIMIT 1',
    [address]
  );
  if (rows.length === 0) return null;
  return rows[0].twitter_username;
}

async function getAddressTwitterBindings(address) {
  const [rows] = await pool.execute(
    'SELECT twitter_username, tweet_url, verified_at FROM shai_twitter_bindings WHERE address = ? ORDER BY verified_at DESC',
    [address]
  );
  return rows;
}

module.exports = {
  initialize, getBalance, getRecentTransactions, transfer, batchTransfer,
  resolveApiKey, createApiKey, listApiKeys, deleteApiKey, deleteAllApiKeys, regenerateApiKey,
  bindTwitter, resolveTwitter, getTwitterByAddress, getAddressTwitterBindings
};
