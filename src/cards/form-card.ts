import { css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
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
import "./form-card-editor";
import type { FormCardConfig, FormCardField } from "./form-card-config";
import { FormBaseCard } from "../shared/form-base-card";
import { computeInitialHaFormData } from "../utils/form/compute-initial-ha-form-data";

registerCustomCard({
  type: FORM_CARD_NAME,
  name: "Form Card",
  description: "Card to build forms with grid engine and dependencies",
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
    for (const [key, unsubPromise] of this._unsubRenderTemplates.entries()) {
      unsubPromise.then((unsub) => unsub?.());
      this._unsubRenderTemplates.delete(key);
    }
    super.disconnectedCallback();
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (!this.hass || !this._config) return;

    if (changedProps.has("hass") || changedProps.has("_config") || changedProps.has("_templateResults")) {
      this._processedSchema = this._schema(this._config.fields);
    }
  }

  public static  getConfigElement(): LovelaceCardEditor {
    void loadHaComponents();
    void loadDeveloperToolsTemplate();
    return document.createElement(FORM_CARD_EDITOR_NAME) as LovelaceCardEditor;
  }

  public static  getStubConfig(hass: HomeAssistant): FormCardConfig {
    const entities = Object.keys(hass.states);
    const entity_id = entities[0] ?? "unknown.entity";
    const field_name = entity_id.substring(0, 15);
    const field_key = slugify(field_name);
    return {
      type: `custom:${FORM_CARD_NAME}`,
      columns: 2,
      fields: [{ name: field_key, label: field_name, selector: { text: {} } }],
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

    try {
      const sub = subscribeRenderTemplate(
        this.hass.connection,
        (result) => {
          this._templateResults = { ...this._templateResults, [templateKey]: result as RenderTemplateResult };
        },
        { template, variables, strict: true, report_errors: true }
      );
      this._unsubRenderTemplates.set(templateKey, sub);
      await sub;
    } catch (err) {
      this._templateResults = { ...this._templateResults, [templateKey]: { result: "Subscription failed" } as RenderTemplateResult };
      this._unsubRenderTemplates.delete(templateKey);
    }
  }

  private _processTemplatedObject(fieldId: string, obj: any, pathPrefix = ""): any {
    if (!obj) return obj;
    const prefix = pathPrefix ? `${pathPrefix}.` : "";
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
        if (Array.isArray(value)) return value.map((item) => processValue(item));
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, processValue(v)]));
      }
      return value;
    };
    return processValue(obj);
  }

  // Feature 3: Dynamic Multi-Select Form Dependencies
  private _schema(fields: FormCardField[]): HaFormSchema[] {
    const currentData = this._formData ?? {};

    return fields
      .filter((field) => {
        if (field.depends_on) {
          const dependentValue = currentData[field.depends_on];
          if (field.show_if_value !== undefined && dependentValue !== field.show_if_value) {
            return false;
          }
        }
        return true;
      })
      .map((field) => {
        const templatedField = this._processTemplatedObject(field.name, field, "fields");

        if (templatedField.entity && !templatedField.default) {
          const base = this.hass.states[templatedField.entity];
          if (base) templatedField.default = base.state;
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

    // Feature 1: Explicit Grid Configuration Engine
    const gridColumns = this._config.columns ?? 1;
    const gridStyles = styleMap({
      display: "grid",
      gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
      gap: "16px",
    });

    return html`
      <ha-card .header=${title} class=${classMap({ "fill-container": fill_container, "no-header": !title })}>
        <div class="card-content">
          ${hasWarnings ? html`
            <ha-alert alert-type="warning" .title=${this.hass.localize("ui.errors.config.editor_not_supported")}>
              <ul>${this._warnings!.map((warning) => html`<li>${warning}</li>`)}</ul>
            </ha-alert>
          ` : nothing}
          
          <div style=${gridStyles}>
            ${this._processedSchema.map((schemaItem) => {
      // Extract matching field parameters to calculate custom spans instantly
      const fieldOrigin = this._config!.fields.find(f => f.name === schemaItem.name);
      const itemSpan = fieldOrigin?.grid_span ?? 1;
      const itemStyles = styleMap({
        gridColumn: `span ${Math.min(itemSpan, gridColumns)}`,
      });

      return html`
                <div style=${itemStyles}>
                  <ha-form
                    .hass=${this.hass}
                    .schema=${[schemaItem]}
                    .data=${formData}
                    .computeLabel=${computeLabel}
                    .computeHelper=${computeHelper}
                    .computeError=${this._computeError}
                    @value-changed=${this._formDataChanged}
                  ></ha-form>
                </div>
              `;
    })}
          </div>
          
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
        <span slot="header">Debug Data</span>
        <ha-yaml-editor read-only auto-update .value=${this._debugData}></ha-yaml-editor>
      </ha-expansion-panel>
    `;
  }

  private readonly _computeError = (error: string) => error;

  private _resetChanges(): void {
    if (this._initialValue) {
      this._formData = structuredClone(this._initialValue);
      this._processedSchema = this._schema(this._config!.fields);
      fireEvent(this, "value-changed", { value: this._formData });
    }
  }

  // Pure data synchronization event hook
  private _formDataChanged(ev: CustomEvent) {
    ev.stopPropagation();
    // Maintain state consistency by safely merging fields over our source dictionary record
    this._formData = { ...this._formData, ...ev.detail.value };
    this._processedSchema = this._schema(this._config!.fields);
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

    const updatedActionConfig = { ...actionConfig, data: Object.fromEntries(processedData) };
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

    if (this._config?.confirmation) {
      let confirmMessage = this._config.confirmation;
      if (formData) {
        Object.entries(formData).forEach(([key, val]) => {
          confirmMessage = confirmMessage.replace(new RegExp(`{{\\s*value.${key}\\s*}}`, 'g'), String(val ?? ''));
        });
      }

      const confirmHook = window.confirm(confirmMessage);
      if (!confirmHook) return;
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
        .error { color: var(--error-color, red); font-weight: 500; margin-top: 8px; }
        ha-card { max-width: 600px; margin: 0 auto; height: 100%; justify-content: space-between; flex-direction: column; display: flex; }
        .card-content { display: flex; justify-content: space-between; flex-direction: column; padding: 16px; }
        .card-actions { text-align: center; height: 48px; display: flex; justify-content: space-between; align-items: center; flex-direction: row; gap: 10px; margin-top: 16px; } 
        .card-actions > * { flex: 1; }
        
        /* Clean layout reset: 
           Ensures that single-schema child elements occupy 100% of their dynamic layout cell blocks 
        */
        ha-form { 
          display: block; 
          margin-top: 0px !important; 
        }
        
        .form-grid-container > div {
          width: 100%;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap { "form-card": FormCard; }
}