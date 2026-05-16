import { useCallback, useEffect, useState } from "react";
import { getControlValue, setControlValue } from "../client/tauri";
import { FlatControl } from "./useDeviceTree";

export type ControlValues = Record<string, unknown>;

/** Polls all Apollo control values every 3s and provides an optimistic setter. */
export function useControlValues(controls: FlatControl[]) {
  const [values, setValues] = useState<ControlValues>({});
  const [loading, setLoading] = useState(true);
  const [sdkAvailable, setSdkAvailable] = useState(true);

  const fetchAll = useCallback(async () => {
    if (controls.length === 0) return;
    let anySuccess = false;
    const pairs = await Promise.all(
      controls.map(async c => {
        try {
          const value = await getControlValue(c.path);
          anySuccess = true;
          return { path: c.path, value };
        } catch {
          return { path: c.path, value: undefined };
        }
      })
    );
    setValues(prev => {
      const next = { ...prev };
      pairs.forEach(({ path, value }) => {
        if (value !== undefined) next[path] = value;
      });
      return next;
    });
    setSdkAvailable(anySuccess);
    setLoading(false);
  }, [controls]);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 3000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const setValue = useCallback(async (path: string, value: unknown) => {
    setValues(prev => ({ ...prev, [path]: value }));
    try {
      await setControlValue(path, value);
      setTimeout(async () => {
        try {
          const confirmed = await getControlValue(path);
          setValues(prev => ({ ...prev, [path]: confirmed }));
        } catch { /* ignore */ }
      }, 400);
    } catch (e) {
      console.error("setControlValue failed:", path, e);
    }
  }, []);

  return { values, loading, sdkAvailable, setValue, refresh: fetchAll };
}
