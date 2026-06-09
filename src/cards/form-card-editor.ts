import type { CSSResultGroup, PropertyValues } from "lit";
import { html, css, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { assert } from "superstruct";
import type { HomeAssistant } from "home-assistant-types";
// Correct path to fetch configuration structs safely from your sibling directory card layer
import type { FormCardEditorFieldRow } from "../components/form-card-editor-field-row";
import type { LovelaceConfig } from "home-assistant-types/dist/data/lovelace/config/types";
import type { LovelaceCardEditor } from "home-assistant-types/dist/panels/lovelace/types";
import type { HaFormSchema } from "home-assistant-types/dist/components/ha-form/types";

import memoizeOne from "memoize-one";
import { FORM_CARD_EDITOR_NAME } from "../const"; // Correct path relative to src/cards/
import type { FormCardConfig, FormCardField } from "./form-card-config";
import { formCardConfigStruct } from "./form-card-config";
import setupCustomlocalize from "../localize";
import { fireEvent, loadConfigDashboard, loadHaComponents } from "../utils";

// CRITICAL FIX: Step out of src/cards/ and go into src/components/ to find your fields manager file!
import "../components/form-card-editor-fields"; 

@customElement(FORM_CARD_EDITOR_NAME)
export class FormCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public lovelace?: LovelaceConfig;

  @property({ attribute: false }) public _config?: FormCardConfig;
  @state() private _activeTab = "settings"; // "settings" or "fields"

  public setConfig(config: FormCardConfig): void {
    assert(config, formCardConfigStruct);
    this._config = config;
    this.requestUpdate();
  }

  connectedCallback() {
    super.connectedCallback();
    void loadHaComponents();
    void loadConfigDashboard();
  }

  // Type-safe schema mappings with strings packed into permitted 'context' records
  private _renderSettingsSchema = memoizeOne((): HaFormSchema[] => [
    {
      name: "title",
      selector: { text: {} },
      context: { label: "Card Title" }
    },
    {
      name: "columns",
      selector: { number: { min: 1, max: 12, mode: "slider", step: 1 } },
      context: { label: "Layout Grid Max Columns" }
    },
    {
      name: "confirmation",
      selector: { text: { multiline: true } },
      context: { label: "Dynamic Confirmation Warning Message" }
    },
    {
      name: "save_label",
      selector: { text: {} },
      context: { label: "Submit Button Text" }
    },
    {
      name: "reset_on_submit",
      selector: { boolean: {} },
      context: { label: "Clear Form Data Upon Submission Success" }
    },
    {
      name: "hide_undo_button",
      selector: { boolean: {} },
      context: { label: "Hide Form Reset/Undo Button" }
    },
  ]);

  private _computeLabel = (schema: HaFormSchema): string => {
    if (schema.context?.label) return schema.context.label;
    return schema.name 
      ? schema.name.charAt(0).toUpperCase() + schema.name.slice(1).replace(/_/g, " ") 
      : "";
  };

  protected render() {
    if (!this.hass || !this._config) return nothing;

    const tabs = [
      { id: "settings", icon: "mdi:cog", label: "Card Settings" },
      { id: "fields", icon: "mdi:form-select", label: "Manage Fields" },
    ];

    return html`
      <div class="tabs">
        ${tabs.map(
          (tab) => html`
            <button
              class="tab ${this._activeTab === tab.id ? "active" : ""}"
              @click=${() => { this._activeTab = tab.id; }}
            >
              <ha-icon .icon=${tab.icon}></ha-icon>
              ${tab.label}
            </button>
          `
        )}
      </div>

      <div class="panel-content">
        ${this._activeTab === "settings"
          ? html`
              <ha-form
                .hass=${this.hass}
                .data=${this._config}
                .schema=${this._renderSettingsSchema()}
                .computeLabel=${this._computeLabel}
                @value-changed=${this._cardSettingsChanged}
              ></ha-form>
            `
          : html`
              <form-card-editor-fields
                .hass=${this.hass}
                .fields=${this._config.fields ?? []}
                .maxColumns=${this._config.columns ?? 4}
                @value-changed=${this._fieldsListMutated}
              ></form-card-editor-fields>
            `}
      </div>
    `;
  }

  // Add this method hook handler to pass structural field modifications up into Lovelace's context
  private _fieldsListMutated(ev: CustomEvent) {
    ev.stopPropagation();
    if (!this._config) return;

    fireEvent(this, "config-changed", { 
      config: { ...this._config, fields: ev.detail.value } 
    });
  }

  private _cardSettingsChanged(ev: CustomEvent) {
    ev.stopPropagation();
    if (!this._config) return;
    
    const updatedConfig = { ...this._config, ...ev.detail.value };
    fireEvent(this, "config-changed", { config: updatedConfig });
  }

  static get styles(): CSSResultGroup {
    return css`
      .tabs { display: flex; border-bottom: 1px solid var(--divider-color); margin-bottom: 16px; gap: 8px; }
      .tab { background: none; border: none; padding: 10px 16px; cursor: pointer; font-weight: 500; color: var(--secondary-text-color); display: flex; align-items: center; gap: 8px; border-bottom: 2px solid transparent; font-size: 14px; }
      .tab:hover { color: var(--primary-text-color); }
      .tab.active { color: var(--primary-color); border-bottom-color: var(--primary-color); }
      .panel-content { padding: 4px 0; }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "form-card-editor": FormCardEditor;
  }
}