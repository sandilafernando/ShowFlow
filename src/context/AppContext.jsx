import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, hasBridge } from '../lib/api.js';
import { ConfirmSurface, Modal, Spinner, ToastViewport } from '../components/ui.jsx';

const AppContext = createContext(null);

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider.');
  return value;
}

let toastSequence = 0;

export function AppProvider({ children }) {
  const [appInfo, setAppInfo] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const timers = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (tone, title, message = '') => {
      const id = ++toastSequence;
      setToasts((current) => [...current.slice(-3), { id, tone, title, message }]);
      const timer = setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
        timers.current.delete(id);
      }, tone === 'error' ? 7000 : 4400);
      timers.current.set(id, timer);
      return id;
    },
    [],
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const timer of activeTimers.values()) clearTimeout(timer);
      activeTimers.clear();
    };
  }, []);

  const toast = useMemo(
    () => ({
      success: (title, message) => pushToast('success', title, message),
      error: (title, message) => pushToast('error', title, message),
      warning: (title, message) => pushToast('warning', title, message),
      info: (title, message) => pushToast('info', title, message),
    }),
    [pushToast],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setBootError(null);
    try {
      if (!hasBridge()) {
        throw new Error(
          'The ShowFlow bridge is not available. Open ShowFlow through the desktop application, not a browser tab.',
        );
      }
      const [info, storedSettings] = await Promise.all([api('app.info'), api('settings.get')]);
      setAppInfo(info);
      setSettings(storedSettings);
    } catch (error) {
      setBootError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const completeSetup = useCallback(async (patch) => {
    const next = await api('setup.complete', patch);
    setSettings(next);
    return next;
  }, []);

  const refreshSettings = useCallback(async () => {
    const next = await api('settings.get');
    setSettings(next);
    return next;
  }, []);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const settleConfirm = useCallback(
    (value) => {
      setConfirmState((current) => {
        current?.resolve(value);
        return null;
      });
    },
    [],
  );

  const value = useMemo(
    () => ({
      appInfo,
      settings,
      setSettings,
      bootError,
      loading,
      reloadApp: load,
      completeSetup,
      refreshSettings,
      toast,
      confirm,
      confirming: Boolean(confirmState),
    }),
    [appInfo, settings, bootError, loading, load, completeSetup, refreshSettings, toast, confirm, confirmState],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <Modal
        open={Boolean(confirmState)}
        onClose={() => settleConfirm(false)}
        title={confirmState?.title || 'Confirm action'}
        eyebrow={confirmState?.eyebrow}
        size="sm"
        footer={null}
      >
        {confirmState ? (
          <ConfirmSurface
            title={confirmState.title}
            message={confirmState.message}
            detail={confirmState.detail}
            confirmLabel={confirmState.confirmLabel}
            tone={confirmState.tone}
            onConfirm={() => settleConfirm(true)}
            onCancel={() => settleConfirm(false)}
          />
        ) : null}
      </Modal>
    </AppContext.Provider>
  );
}

export function BootScreen({ error, onRetry }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 30, position: 'relative', zIndex: 1 }}>
      <div style={{ width: 'min(440px, 100%)' }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>ShowFlow · startup</div>
        {error ? (
          <>
            <h1 style={{ fontSize: 23, letterSpacing: '-.02em', marginBottom: 8 }}>ShowFlow could not open</h1>
            <p className="text-muted" style={{ fontSize: 13, lineHeight: '20px' }}>{error.message}</p>
            {onRetry ? <button className="btn" style={{ marginTop: 18 }} onClick={onRetry}>Try again</button> : null}
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Spinner label="Opening local workspace" />
          </div>
        )}
      </div>
    </div>
  );
}
