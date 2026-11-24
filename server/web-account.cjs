const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createAccountService } = require('../src/native/account-session');

function localCipher(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const keyFile = path.join(directory, 'web-account.key');
  let key;
  try {
    key = fs.readFileSync(keyFile);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    key = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, key, { mode: 0o600, flag: 'wx' });
  }
  if (key.length !== 32) throw new Error('Web 账号密钥长度无效');
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'local-aes-256-gcm',
    encryptString(value) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]);
    },
    decryptString(value) {
      const input = Buffer.from(value);
      if (input.length < 29) throw new Error('Web 账号凭据无效');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, input.subarray(0, 12));
      decipher.setAuthTag(input.subarray(12, 28));
      return Buffer.concat([decipher.update(input.subarray(28)), decipher.final()]).toString('utf8');
    },
  };
}

function createWebAccountService({ dataRoot, filePath } = {}) {
  const root = dataRoot || path.resolve(__dirname, '../.web-runtime/data');
  const target = filePath || path.join(root, 'web-account.bin');
  return createAccountService({ filePath: target, safeStorage: localCipher(path.dirname(target)) });
}

function publicAccount(result) {
  const account = result?.signedIn || result?.status === 'signed-in' ? result.account : null;
  return {
    loggedIn: Boolean(account),
    userId: String(account?.id || ''),
    nickname: String(account?.nickname || ''),
    avatar: String(account?.avatar || ''),
  };
}

module.exports = { createWebAccountService, publicAccount };
