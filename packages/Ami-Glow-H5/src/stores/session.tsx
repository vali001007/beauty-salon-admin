import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, CustomerProfile, TrackingParams } from '../types/customer-app';
import { readWechatOAuthParams } from '../utils/wechat';

const TOKEN_KEY = 'ami_glow_h5_token';
const STORE_KEY = 'ami_glow_h5_store_id';
const SESSION_KEY = 'ami_glow_h5_session_id';

type SessionContextValue = {
  token?: string;
  storeId?: number;
  sessionId: string;
  customer: CustomerProfile | null;
  tracking: TrackingParams;
  setStoreId: (storeId?: number) => void;
  applyAuth: (response: AuthResponse) => void;
  clearAuth: () => void;
  refreshMe: () => Promise<CustomerProfile | null>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function getStoredSessionId() {
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(SESSION_KEY, next);
  return next;
}

function getInitialStoreId() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = Number(params.get('storeId'));
  if (Number.isFinite(fromUrl) && fromUrl > 0) return fromUrl;
  const stored = Number(window.localStorage.getItem(STORE_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : undefined;
}

function getTrackingParams(): TrackingParams {
  const params = new URLSearchParams(window.location.search);
  const wechat = readWechatOAuthParams(params);
  return {
    channel: params.get('channel') || params.get('utm_medium') || (wechat.inWechat ? 'wechat_h5' : 'h5'),
    campaignId: params.get('campaignId') || params.get('utm_campaign') || undefined,
    promotionId: params.get('promotionId') ? Number(params.get('promotionId')) : undefined,
    staffId: params.get('staffId') ? Number(params.get('staffId')) : undefined,
    source: params.get('source') || params.get('utm_source') || 'ami_glow_h5',
    medium: params.get('utm_medium') || undefined,
    wechatCode: wechat.code,
    oauthState: wechat.state,
    inWechat: wechat.inWechat,
  };
}

export function getSessionToken() {
  return window.localStorage.getItem(TOKEN_KEY) || undefined;
}

export function getSessionStoreId() {
  const stored = Number(window.localStorage.getItem(STORE_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : undefined;
}

export function getSessionId() {
  return getStoredSessionId();
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | undefined>(() => getSessionToken());
  const [storeIdState, setStoreIdState] = useState<number | undefined>(() => getInitialStoreId());
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [sessionId] = useState(() => getStoredSessionId());
  const [tracking] = useState(() => getTrackingParams());

  const setStoreId = useCallback((next?: number) => {
    setStoreIdState(next);
    if (next) window.localStorage.setItem(STORE_KEY, String(next));
    else window.localStorage.removeItem(STORE_KEY);
  }, []);

  const applyAuth = useCallback(
    (response: AuthResponse) => {
      window.localStorage.setItem(TOKEN_KEY, response.token);
      setToken(response.token);
      setCustomer(response.customer);
      if (response.customer?.storeId) setStoreId(response.customer.storeId);
    },
    [setStoreId],
  );

  const clearAuth = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(undefined);
    setCustomer(null);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!getSessionToken()) {
      setCustomer(null);
      return null;
    }
    const { getMe } = await import('../services/customerApp');
    try {
      const me = await getMe();
      setCustomer(me);
      setStoreId(me.storeId);
      return me;
    } catch {
      clearAuth();
      return null;
    }
  }, [clearAuth, setStoreId]);

  useEffect(() => {
    if (token) void refreshMe();
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      token,
      storeId: storeIdState,
      sessionId,
      customer,
      tracking,
      setStoreId,
      applyAuth,
      clearAuth,
      refreshMe,
    }),
    [token, storeIdState, sessionId, customer, tracking, setStoreId, applyAuth, clearAuth, refreshMe],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
