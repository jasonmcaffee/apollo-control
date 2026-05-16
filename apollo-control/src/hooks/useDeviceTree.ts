import { useEffect, useState } from "react";
import { getDeviceTree } from "../client/tauri";

export interface FlatControl {
  label: string;
  path: string;
  type: "bool" | "float" | "int";
  min?: number;
  max?: number;
  group: string;
}

interface UseDeviceTreeResult {
  controls: FlatControl[];
  loading: boolean;
  error: string | null;
}

/** Fetches the Apollo device tree and flattens it into a list of addressable controls. */
export function useDeviceTree(): UseDeviceTreeResult {
  const [controls, setControls] = useState<FlatControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDeviceTree()
      .then(tree => setControls(flattenTree(tree)))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return { controls, loading, error };
}

function flattenTree(tree: unknown): FlatControl[] {
  const result: FlatControl[] = [];
  const root = (tree as Record<string, unknown>)?.device as Record<string, unknown>;
  if (!root) return result;

  const children = root.children as Record<string, unknown>;
  if (!children) return result;

  extractControls(children.monitor as Record<string, unknown>, "Monitor", result);

  const hps = children.headphones as Array<Record<string, unknown>>;
  hps?.forEach(hp => extractControls(hp, String(hp.label ?? "HP"), result));

  const inputs = children.inputs as Array<Record<string, unknown>>;
  inputs?.forEach(inp => extractControls(inp, String(inp.label ?? "Input"), result));

  const auxes = children.auxes as Array<Record<string, unknown>>;
  auxes?.forEach(aux => extractControls(aux, String(aux.label ?? "Aux"), result));

  return result;
}

function extractControls(group: Record<string, unknown>, groupLabel: string, out: FlatControl[]) {
  if (!group) return;
  const controls = group.controls as Array<Record<string, unknown>>;
  controls?.forEach(c => {
    out.push({
      label: String(c.label ?? ""),
      path: String(c.path ?? ""),
      type: (c.type as FlatControl["type"]) ?? "bool",
      min: c.min != null ? Number(c.min) : undefined,
      max: c.max != null ? Number(c.max) : undefined,
      group: groupLabel,
    });
  });
}
