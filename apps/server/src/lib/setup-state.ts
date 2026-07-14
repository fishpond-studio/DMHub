import { readFileSync, writeFileSync, existsSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { encrypt, decrypt } from './crypto.js';

const STATE_FILE = join(homedir(), '.dmhub-setup.json');

export interface SetupState {
  dbConfigured: boolean;
  adminRegistered: boolean;
  smtpConfigured: boolean;
  siteUrlConfigured: boolean;
  initialized: boolean;
  dbConfig?: {
    dbType: string;
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    redisUrl?: string;
  };
  /** @deprecated 已废弃，保留兼容 */
  tablePrefix?: string;
  siteUrl?: string;
  smtpConfig?: {
    host: string;
    port: number;
    user: string;
    password: string;
    from: string;
    secure: boolean;
  };
}

const defaultState: SetupState = {
  dbConfigured: false,
  adminRegistered: false,
  smtpConfigured: false,
  siteUrlConfigured: false,
  initialized: false,
};

export function readSetupState(): SetupState {
  if (!existsSync(STATE_FILE)) {
    return { ...defaultState };
  }
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8');
    const state = { ...defaultState, ...JSON.parse(raw) };
    if (state.dbConfig?.password) {
      try { state.dbConfig.password = decrypt(state.dbConfig.password); } catch {}
    }
    if (state.smtpConfig?.password) {
      try { state.smtpConfig.password = decrypt(state.smtpConfig.password); } catch {}
    }
    return state;
  } catch {
    return { ...defaultState };
  }
}

export function writeSetupState(state: SetupState): void {
  const toWrite = { ...state };
  if (toWrite.dbConfig?.password) {
    toWrite.dbConfig = { ...toWrite.dbConfig, password: encrypt(toWrite.dbConfig.password) };
  }
  if (toWrite.smtpConfig?.password) {
    toWrite.smtpConfig = { ...toWrite.smtpConfig, password: encrypt(toWrite.smtpConfig.password) };
  }
  writeFileSync(STATE_FILE, JSON.stringify(toWrite, null, 2), 'utf-8');
  try {
    chmodSync(STATE_FILE, 0o600);
  } catch {}
}

export function isDbConfigured(): boolean {
  const state = readSetupState();
  return state.dbConfigured;
}

export function updateSetupState(partial: Partial<SetupState>): void {
  const state = readSetupState();
  writeSetupState({ ...state, ...partial });
}
