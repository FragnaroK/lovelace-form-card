import { css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import type { CSSResultGroup, PropertyValues } from "lit";
import type { HomeAssistant } from "home-assistant-types";
import type { LovelaceCard, LovelaceCardEditor } from "home-assistant-types/dist/panels/lovelace/types";
import type { ActionConfig } from "home-assistant-types/dist/data/lovelace/config/action";
import type { RenderTemplateResult } from "home-assistant-types/dist/data/ws-templates";
import type { HaProgressButton } from "home-assistant-types/dist/components/buttons/ha-progress-button";
import type { HaFormSchema, HaFormSelector } from "home-assistant-types/dist/components/ha-form/types";

import {
  subscribeRenderTemplate,
  cardStyle,
  loadHaComponents,
  loadConfigDashboard,
  registerCustomCard,
  fireEvent,
  slugify,
  loadDeveloperToolsTemplate,
  findTemplatesInObject,
  getTemplateKey,
  hasTemplate,
  computeHelper,
  computeLabel
} from "../utils";
import setupCustomlocalize from "../localize";

import { FORM_CARD_EDITOR_NAME, FORM_CARD_NAME } from "../const";
import type { FormCardConfig, FormCardField } from "./form-card-config";
import { handleStructError } from "../shared/config";
import { FormBaseCard } from "../shared/form-base-card";
import { computeInitialHaFormData } from "../utils/form/compute-initial-ha-form-data";

registerCustomCard({
  type: FORM_CARD_NAME,
  name: "Form Card",
  description: "Card to build forms",
});

@customElement(FORM_CARD_NAME)
export class FormCard extends FormBaseCard implements LovelaceCard {
  protected readonly _formType = "card";

  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() protected _config?: FormCardConfig;

  @state() private _processedSchema: HaFormSchema[] = [];

  @state() private _errorMsg?: string;

  @state() private _warnings?: string[] = [];

  @state() private _yamlMode = false;

  @state() private _saveStatus: 'idle' | 'loading' | 'success' | 'error' = 'idle';

  setConfig(config: FormCardConfig) {
    if (!config.fields) {
      throw new Error("You need to define form fields");
    }
    this._config = { ...config };
  }

  public async connectedCallback(): Promise<void> {
    super.connectedCallback();
    void loadHaComponents();
    void loadConfigDashboard();

    if (this.hass && this._config) {
      this._processedSchema = this._schema(this._config.fields);
    }
    void this._tryConnect();
  }

  public disconnectedCallback(): void {
    // Structural Guard: Unsubscribe templates on DOM teardown to prevent severe WebSocket leaks
    for (const [key, unsubPromise] of this._unsubRenderTemplates.entries()) {
      unsubPromise.then((unsub) => unsub?.());
      this._unsubRenderTemplates.delete(key);
    }
    super.disconnectedCallback();
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (!this.hass || !this._config) return;

    if (changedProps.has("hass") || changedProps.has("_config")) {
      this._tryConnect().then(() => {
        this._processedSchema = this._schema(this._config!.fields);
      });
    }

    if (changedProps.has("_templateResults")) {
      this._processedSchema = this._schema(this._config.fields);
    }
  }

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./form-card-editor");
    await loadHaComponents();
    await loadDeveloperToolsTemplate();
    return document.createElement(FORM_CARD_EDITOR_NAME) as LovelaceCardEditor;
  }

  public static async getStubConfig(hass: HomeAssistant): Promise<FormCardConfig> {
    const entities = Object.keys(hass.states);
    const entity_id = entities[0] ?? "unknown.entity";
    const field_name = entity_id.substring(0, 15);
    const field_key = slugify(field_name);
    return {
      type: `custom:${FORM_CARD_NAME}`,
      fields: [
        {
          name: field_key,
          label: field_name,
          selector: { text: {} },
        },
      ],
    };
  }

  public getCardSize(): number {
    return 3;
  }

  private async _tryConnect(): Promise<void> {
    if (!this._config) return;

    const foundTemplates = findTemplatesInObject(this._config);
    const promises = foundTemplates.map(([path, template]) => 
      this._tryConnectTemplate(undefined, path, template)
    );
    await Promise.all(promises);
  }

  private async _tryConnectTemplate(fieldId: string | undefined, path: string, template: string): Promise<void> {
    const templateKey = getTemplateKey(fieldId, path);

    if (this._unsubRenderTemplates.has(templateKey) || !this.hass) return;

    const variables = {
      value: this._formData,
      config: this._config,
      user: this.hass.user?.name ?? "Unknown",
      entity: undefined as string | undefined,
    };

    if (!fieldId && templateKey.split(".")[0] === "fields") {
      fieldId = templateKey.split(".")[1];
      variables.entity = this._getProcessedValue(`fields.${fieldId}.entity`);
    }

    try {
      const sub = subscribeRenderTemplate(
        this.hass.connection,
        (result) => {
          this._templateResults = {
            ...this._templateResults,
            [templateKey]: result as RenderTemplateResult,
          };
        },
        { template, variables, strict: true, report_errors: true }
      );
      this._unsubRenderTemplates.set(templateKey, sub);
      await sub;
    } catch (err) {
      this._templateResults = {
        ...this._templateResults,
        [templateKey]: { result: "Subscription failed" } as RenderTemplateResult,
      };
      this._unsubRenderTemplates.delete(templateKey);
    }
  }

  private _processTemplatedObject(fieldId: string, obj: any, pathPrefix = ""): any {
    if (!obj) return obj;
    const prefix = pathPrefix ? `${pathPrefix}.` : "";
    
    // Performance Optimization: Cache object template allocations outside recursive evaluation loop
    const cachedTemplates = findTemplatesInObject(obj);

    const processValue = (value: any): any => {
      if (typeof value === "string" && hasTemplate(value)) {
        const path = cachedTemplates.find(([_, template]) => template === value)?.[0];
        if (path) {
          const templateKey = getTemplateKey(`${prefix}${fieldId}`, path);
          const res = this._templateResults[templateKey] ?? {};
          return "result" in res ? res.result : value;
        }
        return value;
      }

      if (typeof value === "object" && value !== null) {
        if (Array.isArray(value)) {
          return value.map((item) => processValue(item));
        }
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, processValue(v)])
        );
      }
      return value;
    };

    return processValue(obj);
  }

  private _schema(fields: FormCardField[]): HaFormSchema[] {
    return fields.map((field) => {
      const templatedField = this._processTemplatedObject(field.name, field, "fields");

      if (templatedField.entity && !templatedField.default) {
        const entity_id = templatedField.entity;
        const base = this.hass.states[entity_id];
        const entity = base || {
          entity_id: "binary_sensor.",
          attributes: { icon: "no:icon", friendly_name: "" },
          state: "off",
        };
        templatedField.default = entity?.state ?? undefined;
      }

      return {
        name: field.name,
        selector: templatedField.selector,
        required: templatedField.required,
        disabled: templatedField.disabled,
        default: templatedField.default,
        description: templatedField.placeholder ? { suggested_value: templatedField.placeholder } : undefined,
        context: {
          label: templatedField.label,
          description: templatedField.description,
          entity: templatedField.entity,
        },
      } as HaFormSelector;
    });
  }

  private get _formDataProcessed() {
    if (this._formData !== undefined) return this._formData;
    this._formData = computeInitialHaFormData(this._processedSchema);
    this._updateInitialValue();
    return this._formData;
  }

  render() {
    if (!this._config || !this.hass) return nothing;

    const formData = this._formDataProcessed;
    const title = this._getProcessedValue("title");
    const hasPendingChanges = this._hasPendingChanges();
    const hasWarnings = (this._warnings?.length ?? 0) > 0;
    const fill_container = this._config.fill_container ?? false;
    const save_label = this._getProcessedValue("save_label") ?? this.hass.localize("ui.common.save");

    const errorMsg = this._errorMsg ? html`<div class="error" role="alert">${this._errorMsg}</div>` : nothing;

    return html`
      <ha-card .header=${title} class=${classMap({ "fill-container": fill_container, "no-header": !title })}>
        <div class="card-content">
          ${hasWarnings ? html`
            <ha-alert alert-type="warning" .title=${this.hass.localize("ui.errors.config.editor_not_supported")}>
              <ul>${this._warnings!.map((warning) => html`<li>${warning}</li>`)}</ul>
              ${this.hass.localize("ui.errors.config.edit_in_yaml_supported")}
            </ha-alert>
          ` : nothing}
          
          <ha-form
            .hass=${this.hass}
            .schema=${this._processedSchema}
            .data=${formData}
            .error=${this._errorMsg}
            .computeLabel=${computeLabel}
            .computeHelper=${computeHelper}
            .computeError=${this._computeError}
            @value-changed=${this._formDataChanged}
            @ui-mode-not-available=${this._handleUiModeNotAvailable}
          ></ha-form>
          
          ${errorMsg}
          
          <div class="card-actions">
            ${this._config.hide_undo_button ? nothing : html`
              <ha-button @click=${this._resetChanges} .disabled=${!hasPendingChanges}>
                ${this.hass.localize("ui.common.undo")}
              </ha-button>
            `}
            <ha-progress-button .progress=${this._saveStatus === 'loading'} @click=${this._handleSave}> 
              ${save_label} 
            </ha-progress-button>
          </div>
        </div>
        ${this.preview ? this._renderDebug() : nothing}
      </ha-card>
    `;
  }

  private _renderDebug() {
    if (!this._debugData) return nothing;
    return html`
      <ha-expansion-panel class="debug">
        <span slot="header">Debug</span>
        <ha-yaml-editor read-only auto-update .value=${this._debugData}></ha-yaml-editor>
      </ha-expansion-panel>
    `;
  }

  private _handleUiModeNotAvailable(ev: CustomEvent) {
    ev.stopPropagation();
    this._warnings = handleStructError(this.hass, ev.detail).warnings;
    if (!this._yamlMode) this._yamlMode = true;
  }

  private readonly _computeError = (error: string) => error;

  private _resetChanges(): void {
    if (this._initialValue) {
      this._formData = structuredClone(this._initialValue);
      fireEvent(this, "value-changed", { value: this._formData });
    }
  }

  private _formDataChanged(ev: CustomEvent) {
    ev.stopPropagation();
    this._formData = { ...ev.detail.value };
    fireEvent(this, "value-changed", { value: this._formData });
  }

  public async performAction(actionConfig: ActionConfig | undefined | null, value: any) {
    if (!actionConfig) return;
    if (actionConfig.action !== "call-service" && actionConfig.action !== "perform-action") return;

    const variables = { value };
    const processedData = await Promise.all(
      Object.entries(actionConfig.data ?? (actionConfig as any).service_data ?? {}).map(
        async ([key, v]): Promise<[string, any]> => {
          if (typeof v === "string" && hasTemplate(v)) {
            return [key, (await this._renderTemplate(v, variables)).result];
          }
          return [key, v];
        }
      )
    );

    const updatedActionConfig = {
      ...actionConfig,
      data: Object.fromEntries(processedData),
    };

    await this._performAction(updatedActionConfig, value);
  }

  public async performActions(actionsConfig: ActionConfig[] | undefined | null, value: any) {
    if (!actionsConfig?.length) return;
    for (const action of actionsConfig) {
      await this.performAction(action, value);
    }
  }

  private async _handleSave(ev: CustomEvent) {
    const button = ev.target as HaProgressButton;
    if (this._saveStatus === 'loading') return;

    const customLocalize = setupCustomlocalize(this.hass);
    const formData = this._formData;

    const isFormEmpty = formData === undefined;
    const areThereRequiredFields = this._processedSchema.some(field => field.required);
    const requiredFieldsEmpty = areThereRequiredFields && 
      this._processedSchema.every(field => field.required && ["", undefined].includes(formData?.[field.name]));

    if ((isFormEmpty && areThereRequiredFields) || requiredFieldsEmpty) {
      this._errorMsg = customLocalize("card.not_all_required_fields");
      await this.performActions(this._config?.error_actions, this._errorMsg ?? "");
      return;
    }

    this._saveStatus = 'loading';
    this._errorMsg = undefined;
    await this.performActions(this._config?.progress_actions, "");

    try {
      await this.performActions(this._config?.save_actions, formData);
      button.actionSuccess();
      this._saveStatus = 'success';

      if (this._config?.success_actions) {
        await this.performActions(this._config.success_actions, formData);
      }

      if (this._config?.reset_on_submit) {
        this._resetChanges();
      } else {
        this._updateInitialValue();
      }
    } catch (err: any) {
      button.actionError();
      this._errorMsg = err.message;
      this._saveStatus = 'error';
      await this.performActions(this._config?.error_actions, err.message);
    } finally {
      this._saveStatus = 'idle';
    }
  }

  static get styles(): CSSResultGroup {
    return [
      cardStyle,
      css`
        ha-settings-row {
          --paper-time-input-justify-content: flex-end;
          --settings-row-content-width: 100%;
          --settings-row-prefix-display: contents;
          border-top: var(--service-control-items-border-top, 1px solid var(--divider-color));
        }
        .error {
          color: var(--error-color, red);
          font-weight: 500;
          margin-top: 8px;
        }
        ha-card {
          max-width: 600px;
          margin: 0 auto;
          height: 100%;
          justify-content: space-between;
          flex-direction: column;
          display: flex;
        }
        ha-alert, ha-form {
          margin-top: 24px;
          display: block;
        }
        .card-content {
          display: flex;
          justify-content: space-between;
          flex-direction: column;
          padding: 0 16px 16px 16px;
        }
        .no-header .card-content {
          padding-top: 16px;
        }
        .card-actions {
          text-align: center;
          height: 48px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-direction: row;
          gap: 10px;
          margin-top: 16px;
        } 
        .card-actions > * {
          flex: 1;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "form-card": FormCard;
  }
}