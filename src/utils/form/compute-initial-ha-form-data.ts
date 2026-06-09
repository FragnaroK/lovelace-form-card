import type { Selector } from "home-assistant-types/dist/data/selector";
import type { HaFormSchema } from "home-assistant-types/dist/components/ha-form/types";

const FIELD_TYPE_DEFAULTS: Record<string, any> = {
  boolean: false,
  string: "",
  float: 0.0,
  positive_time_period_dict: { hours: 0, minutes: 0, seconds: 0 },
};

const SIMPLE_SELECTOR_DEFAULTS: Record<string, any> = {
  boolean: false,
  addon: "", attribute: "", file: "", icon: "", template: "", text: "", theme: "", object: "",
  time: "00:00:00",
  color_rgb: [0, 0, 0],
};

const getSelectorDefault = (selector: Selector, key: string): any => {
  if (key in SIMPLE_SELECTOR_DEFAULTS) return SIMPLE_SELECTOR_DEFAULTS[key];

  const config = (selector as any)[key];

  switch (key) {
    case "device":
    case "entity":
    case "area":
    case "label":
      return config?.multiple ? [] : "";
    case "number":
      return config?.min ?? 0;
    case "select": {
      if (!config?.options?.length) return undefined;
      const firstOpt = config.options[0];
      const val = typeof firstOpt === "string" ? firstOpt : firstOpt.value;
      return config.multiple ? [val] : val;
    }
    case "country":
      return config?.countries?.[0];
    case "language":
      return config?.languages?.[0];
    case "duration":
      return { hours: 0, minutes: 0, seconds: 0 };
    case "date":
    case "datetime":
      return `${new Date().toISOString().slice(0, 10)}T00:00:00`;
    case "color_temp":
      return config?.min_mireds ?? 153;
    case "action":
    case "trigger":
    case "condition":
      return [];
    case "media":
    case "target":
      return {};
    default:
      throw new Error(`Selector "${key}" not supported in initial form data`);
  }
};


export const computeInitialHaFormData = (
  schema: HaFormSchema[] | readonly HaFormSchema[]
): Record<string, any> => {
  const data: Record<string, any> = {};

  schema.forEach((field) => {
    if (field.description?.suggested_value !== undefined && field.description?.suggested_value !== null) {
      data[field.name] = field.description.suggested_value;
      return;
    }
    if ("default" in field) {
      data[field.name] = field.default;
      return;
    }

    if (!field.required) return;

    // Ensure field.type is defined AND check if it exists in defaults object
    if (field.type && field.type in FIELD_TYPE_DEFAULTS) {
      data[field.name] = FIELD_TYPE_DEFAULTS[field.type];
    }
    // Update subsequent checks to use standard string checks instead of 'in'
    else if (field.type === "integer") {
      data[field.name] = "valueMin" in field ? (field as any).valueMin : 0;
    }
    else if (field.type === "constant") {
      data[field.name] = (field as any).value;
    }
    else if (field.type === "expandable") {
      data[field.name] = computeInitialHaFormData((field as any).schema);
    }
    else if (field.type === "select") {
      if ((field as any).options?.length) {
        const val = (field as any).options[0];
        data[field.name] = Array.isArray(val) ? val[0] : val;
      }
    }

    // Handle selectors natively
    else if ("selector" in field) {
      const selector: Selector = field.selector;
      const activeSelectorKey = Object.keys(selector)[0];

      if (activeSelectorKey) {
        const value = getSelectorDefault(selector, activeSelectorKey);
        if (value !== undefined) data[field.name] = value;
      }
    }
  });

  return data;
};