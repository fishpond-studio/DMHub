import { encrypt, decrypt } from './crypto.js';

const SENSITIVE_FIELDS: Record<string, string[]> = {
  cloudflare: ['token'],
  aliyun: ['accessKeySecret'],
  tencent: ['secretKey'],
};

function getSensitiveFields(providerId: string): string[] {
  return SENSITIVE_FIELDS[providerId] ?? [];
}

export function encryptCredentials(providerId: string, credentials: Record<string, string>): Record<string, string> {
  const sensitive = getSensitiveFields(providerId);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (sensitive.includes(key)) {
      result[key] = encrypt(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function decryptCredentials(providerId: string, credentials: Record<string, string>): Record<string, string> {
  const sensitive = getSensitiveFields(providerId);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (sensitive.includes(key)) {
      try {
        result[key] = decrypt(value);
      } catch {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function maskCredentials(providerId: string, credentials: Record<string, string>): Record<string, string> {
  const sensitive = getSensitiveFields(providerId);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (sensitive.includes(key) && value.length > 4) {
      result[key] = '****' + value.slice(-4);
    } else if (sensitive.includes(key)) {
      result[key] = '****';
    } else {
      result[key] = value;
    }
  }
  return result;
}
