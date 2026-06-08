
const isTemplateRegex = /{%|{{/;

export const isTemplate = (value: string): boolean => isTemplateRegex.test(value);

export const hasTemplate = (value: unknown): boolean => {
  if (!value) {
    return false;
  }
  if (typeof value === "string") {
    return isTemplate(value);
  }
  if (typeof value === "object") {
    const values = Array.isArray(value) ? value : Object.values(value);
    return values.some((val) => val && hasTemplate(val));
  }
  return false;
};

export const findTemplatesInObject = (obj: unknown, path: string[] = []): [string, string][] => {
    const templates: [string, string][] = [];

    if (typeof obj === "string" && hasTemplate(obj)) {
        templates.push([path.join("."), obj]);
    }

    if (Array.isArray(obj)) {
        for (let [index, item] of obj.entries()) {
            index = path?.[0] === "fields" ? item.name : index;
            templates.push(...findTemplatesInObject(item, [...path, String(index)]));
        }
    }

    if (typeof obj === "object" && obj !== null) {
        for (const key in obj) {
        if (key === "name") continue;
        templates.push(...findTemplatesInObject(obj[key], [...path, key]));
        }
    }

    return templates;
}

export const getTemplateKey = (fieldId: string | undefined, path: string): string => fieldId ? `${fieldId}.${path}` : path;


