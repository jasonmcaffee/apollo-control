import { useCallback, useEffect, useState } from "react";
import { deleteMapping, getMappings, saveMapping } from "../client/tauri";
import { Mapping } from "../models/types";

interface UseMappingsResult {
  mappings: Mapping[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  upsert: (mapping: Mapping) => Promise<void>;
  remove: (id: string) => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
}

/** Manages the full list of key-to-control mappings, synced with the Rust backend. */
export function useMappings(): UseMappingsResult {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMappings();
      setMappings(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const upsert = useCallback(async (mapping: Mapping) => {
    setMappings(prev => {
      const idx = prev.findIndex(m => m.id === mapping.id);
      return idx >= 0
        ? prev.map((m, i) => (i === idx ? mapping : m))
        : [...prev, mapping];
    });
    await saveMapping(mapping);
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteMapping(id);
    setMappings(prev => prev.filter(m => m.id !== id));
  }, []);

  const toggleEnabled = useCallback(async (id: string) => {
    const mapping = mappings.find(m => m.id === id);
    if (!mapping) return;
    await upsert({ ...mapping, enabled: !mapping.enabled });
  }, [mappings, upsert]);

  return { mappings, loading, error, refresh, upsert, remove, toggleEnabled };
}
