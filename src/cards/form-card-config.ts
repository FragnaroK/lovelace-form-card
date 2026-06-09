import { assign, boolean, object, optional, array, string, any, number } from "superstruct";
import type { ActionConfig } from "home-assistant-types/dist/data/lovelace/config/action";
import type { LovelaceCardConfig } from "home-assistant-types/dist/data/lovelace/config/card";
import type { Selector } from "home-assistant-types/dist/data/selector";

import { lovelaceCardConfigStruct, entitySharedConfigStruct } from "../shared/config";
import { actionConfigStruct } from "../shared/config/struct";

export interface FormCardConfig extends LovelaceCardConfig {
  type: "custom:form-card";
  title?: string;
  fields: FormCardField[];
  columns?: number; // Global grid columns (e.g., 2 or 3 columns)
  confirmation?: string; // Global confirmation text (can contain templates)
  save_label?: string;
  save_icon?: string;
  save_actions?: ActionConfig[];
  error_actions?: ActionConfig[];
  success_actions?: ActionConfig[];
  progress_actions?: ActionConfig[];
  spread_values_to_data?: boolean;
  reset_on_submit?: boolean;
  hide_undo_button?: boolean;
}

export type FormCardFields = Record<string, FormCardField>;

export interface FormCardField {
  name: string;
  selector: Selector;
  label?: string;
  description?: string;
  entity?: string;
  default?: any;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  grid_span?: number; // How many grid columns this field occupies
  depends_on?: string; // The name of another field this field reacts to
  show_if_value?: any; // The value the dependent field must have to show this field
}

export const fieldConfigStruct = object({
  name: string(),
  selector: any(),
  label: optional(string()),
  description: optional(string()),
  entity: optional(string()),
  default: optional(any()),
  disabled: optional(boolean()),
  placeholder: optional(string()),
  required: optional(boolean()),
  grid_span: optional(number()), // Added structural validation
  depends_on: optional(string()), // Added structural validation
  show_if_value: optional(any()), // Added structural validation
});

export const formCardConfigStruct = assign(
  lovelaceCardConfigStruct,
  entitySharedConfigStruct,
  object({
    title: optional(string()),
    fields: array(fieldConfigStruct),
    columns: optional(number()), // Added structural validation
    confirmation: optional(string()), // Added structural validation
    save_label: optional(string()),
    save_icon: optional(string()),
    save_actions: optional(array(actionConfigStruct)), 
    error_actions: optional(array(actionConfigStruct)),
    success_actions: optional(array(actionConfigStruct)),
    progress_actions: optional(array(actionConfigStruct)),
    spread_values_to_data: optional(boolean()),
    reset_on_submit: optional(boolean()),
    hide_undo_button: optional(boolean()),
  })
);