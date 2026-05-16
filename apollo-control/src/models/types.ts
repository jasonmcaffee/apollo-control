export interface KeyCombo {
  modifiers: string[];
  key: string;
}

export type ActionType = "Toggle" | "Step" | "Set" | "Hold" | "Knob";

export interface ToggleAction {
  type: "Toggle";
  path: string;
}

export interface StepAction {
  type: "Step";
  path: string;
  delta: number;
  min: number;
  max: number;
}

export interface SetAction {
  type: "Set";
  path: string;
  value: unknown;
}

export interface HoldAction {
  type: "Hold";
  path: string;
  press_value: unknown;
  release_value: unknown;
}

export interface KnobAction {
  type: "Knob";
  path: string;
  step: number;
  min: number;
  max: number;
}

export type Action = ToggleAction | StepAction | SetAction | HoldAction | KnobAction;

export interface Mapping {
  id: string;
  name: string;
  enabled: boolean;
  trigger: KeyCombo;
  action: Action;
}

export interface ControlNode {
  label: string;
  path: string;
  type?: "bool" | "float" | "int";
  min?: number;
  max?: number;
}

export interface ControlGroup {
  label: string;
  path: string;
  controls?: ControlNode[];
  children?: Record<string, unknown>;
}
