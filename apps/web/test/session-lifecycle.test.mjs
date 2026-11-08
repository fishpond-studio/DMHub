import assert from 'node:assert/strict';
import { fileURLToPath, URL } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url));

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function loadModule(t, path, state, mocks) {
  globalThis.__dmhubSessionTest = state;
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    ssr: { noExternal: ['vue-router', 'axios'] },
    server: { middlewareMode: true, hmr: false, watch: null },
    resolve: { alias: { '@': `${root}src` } },
    plugins: [{
      name: 'session-test-dependencies',
      enforce: 'pre',
      resolveId(id) {
        return Object.hasOwn(mocks, id) ? `\0session-test:${id}` : null;
      },
      load(id) {
        return id.startsWith('\0session-test:') ? mocks[id.slice(14)] : null;
      },
    }],
  });
  t.after(async () => {
    await server.close();
    delete globalThis.__dmhubSessionTest;
  });
  return server.ssrLoadModule(path);
}

const authStoreMock = 'export const useAuthStore = () => globalThis.__dmhubSessionTest.auth;';
const routerMock = `
export function createWebHistory() { return {}; }
export function createRouter() {
  return {
    beforeEach(guard) { globalThis.__dmhubSessionTest.guard = guard; },
    onError() {},
  };
}`;
const routeApiMock = `
const state = globalThis.__dmhubSessionTest;
export const getAccessToken = () => state.token;
export const needsRefresh = () => false;
export async function refreshAccessToken() { state.refreshCalls++; }
export class SessionExpiredError extends Error {}
export default { get: async () => ({ data: { initialized: true } }) };`;

test('a protected page reload hydrates the user even while the saved token is fresh', async (t) => {
  const state = { token: 'fresh-token', refreshCalls: 0, fetchCalls: 0 };
  state.auth = {
    user: null,
    async fetchUser() { state.fetchCalls++; this.user = { role: 'admin' }; },
  };
  await loadModule(t, '/src/router/index.ts', state, {
    'vue-router': routerMock,
    [`${root}src/lib/axios`]: routeApiMock,
    [`${root}src/stores/auth`]: authStoreMock,
  });
  assert.equal(await state.guard({ name: 'home' }), true);
  assert.equal(state.auth.user.role, 'admin');
  assert.equal(state.fetchCalls, 1);
  assert.equal(state.refreshCalls, 0);
  await state.guard({ name: 'settings-team' });
  assert.equal(state.fetchCalls, 1);
});

test('a session rejected during user hydration returns to login', async (t) => {
  const state = { token: 'rejected-token', refreshCalls: 0 };
  state.auth = { user: null, async fetchUser() { state.token = null; } };
  await loadModule(t, '/src/router/index.ts', state, {
    'vue-router': routerMock,
    [`${root}src/lib/axios`]: routeApiMock,
    [`${root}src/stores/auth`]: authStoreMock,
  });
  assert.deepEqual(await state.guard({ name: 'home' }), { name: 'login' });
});

test('the API interceptor preserves explicit two-factor credentials', async (t) => {
  const previousStorage = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: () => 'previous-session-token' };
  t.after(() => { globalThis.sessionStorage = previousStorage; });
  const state = {};
  state.api = {
    interceptors: {
      request: { use(handler) { state.request = handler; } },
      response: { use() {} },
    },
  };
  await loadModule(t, '/src/lib/axios.ts', state, {
    axios: 'export default { create: () => globalThis.__dmhubSessionTest.api };',
    [`${root}src/router`]: 'export default {};',
  });
  const twoFactor = state.request({ headers: { Authorization: 'Bearer temporary-token' } });
  assert.equal(twoFactor.headers.Authorization, 'Bearer temporary-token');
  const regular = state.request({ headers: {} });
  assert.equal(regular.headers.Authorization, 'Bearer previous-session-token');
});

async function notificationStore(t, api) {
  const previousEventSource = globalThis.EventSource;
  const sources = [];
  globalThis.EventSource = class {
    constructor(url) { this.url = url; sources.push(this); }
    close() { this.closed = true; }
  };
  t.after(() => { globalThis.EventSource = previousEventSource; });
  setActivePinia(createPinia());
  const module = await loadModule(t, '/src/stores/notification.ts', { api }, {
    [`${root}src/lib/axios`]: `
export default globalThis.__dmhubSessionTest.api;
export const getAccessToken = () => 'current-token';`,
    [`${root}src/components/ui/toast/use-toast`]: 'export function toast() {}',
  });
  const store = module.useNotificationStore();
  t.after(() => store.disconnect());
  return { store, sources };
}

test('logout during history loading discards old notifications and never opens SSE', async (t) => {
  const history = deferred();
  let ticketCalls = 0;
  const { store, sources } = await notificationStore(t, {
    get: () => history.promise,
    post: async () => { ticketCalls++; return { data: { ticket: 'old' } }; },
    defaults: {},
  });
  const starting = store.start();
  store.disconnect();
  history.resolve({ data: { notifications: [{ id: 'old', title: 'Private' }] } });
  await starting;
  assert.deepEqual(store.notifications, []);
  assert.equal(ticketCalls, 0);
  assert.equal(sources.length, 0);
});

test('logout during ticket loading prevents an old session stream from reconnecting', async (t) => {
  const ticket = deferred();
  const requested = deferred();
  const { store, sources } = await notificationStore(t, {
    get: async () => ({ data: { notifications: [] } }),
    post: () => { requested.resolve(); return ticket.promise; },
    defaults: {},
  });
  const starting = store.start();
  await requested.promise;
  store.disconnect();
  ticket.resolve({ data: { ticket: 'old' } });
  await starting;
  assert.equal(sources.length, 0);
  assert.equal(store.connected, false);
});

test('logout clears cached notifications and ignores messages queued by the closed stream', async (t) => {
  const { store, sources } = await notificationStore(t, {
    get: async () => ({ data: { notifications: [{ id: 'old', title: 'Private' }] } }),
    post: async () => ({ data: { ticket: 'old' } }),
    defaults: {},
  });
  await store.start();
  const source = sources[0];
  source.onopen();
  assert.equal(store.connected, true);
  store.disconnect();
  source.onmessage({ data: JSON.stringify({ id: 'late', title: 'Old account' }) });
  assert.equal(source.closed, true);
  assert.equal(store.connected, false);
  assert.deepEqual(store.notifications, []);
});
