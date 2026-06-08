import { HaFormSchema } from "home-assistant-types/dist/components/ha-form/types";

export const computeLabel = (schema: HaFormSchema): string => schema.context?.label ?? schema.name
export const computeHelper = (schema: HaFormSchema): string | undefined => schema.context?.description ?? undefined