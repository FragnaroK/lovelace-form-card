import type { CSSResultGroup, PropertyValues } from "lit";
import { html, css, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { assert } from "superstruct";
import type { HomeAssistant } from "home-assistant-types";
import type { LovelaceConfig } from "home-assistant-types/dist/data/lovelace/config/types";
import type { LovelaceCardEditor } from "home-assistant-types/dist/panels/lovelace/types";
import type { HaFormSchema } from "home-assistant-types/dist/components/ha-form/types";

import memoizeOne from "memoize-one";
import { FORM_CARD_EDITOR_NAME } from "../const";
import type { FormCardConfig } from "./form-card-config";
import { formCardConfigStruct } from "./form-card-config";
import { fireEvent, loadHaComponents } from "../utils";

import "../components/form-card-editor-fields"; 

@customElement(FORM_CARD_EDITOR_NAME)
export class FormCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public lovelace?: LovelaceConfig;

  @state() private _config?: FormCardConfig;
  @state() private _activeTab = "settings"; // "settings", "fields", or "actions"

  public setConfig(config: FormCardConfig): void {
    assert(config, formCardConfigStruct);
    this._config = config;
  }

  private _computeLabel = (schema: HaFormSchema): string => {
    if (schema.context?.label) return schema.context.label;
    return schema.name ? schema.name.charAt(0).toUpperCase() + schema.name.slice(1).replace(/_/g, " ") : "";
  };

  protected render() {
    if (!this.hass || !this._config) return nothing;

    const tabs = [
      { id: "settings", icon: "mdi:cog", label: "Card Settings" },
      { id: "fields", icon: "mdi:form-select", label: "Manage Fields" },
      { id: "actions", icon: "mdi:play-circle-outline", label: "Form Actions" },
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
                .schema=${[
                  { name: "title", selector: { text: {} }, context: { label: "Card Title Header" } },
                  { name: "columns", selector: { number: { min: 1, max: 4, mode: "slider" } }, context: { label: "Global Grid Column Multiplier Layout" } },
                  { name: "save_label", selector: { text: {} }, context: { label: "Submit Button Text Label (e.g. Save, Send)" } },
                  { name: "save_icon", selector: { icon: {} }, context: { label: "Submit Button Icon Prefix" } },
                  { name: "confirmation", selector: { text: {} }, context: { label: "Optional Confirmation Dialog Pop-up Warning Text" } },
                  { name: "spread_values_to_data", selector: { boolean: {} }, context: { label: "Spread form payload directly into event data dictionary root" } },
                  { name: "reset_on_submit", selector: { boolean: {} }, context: { label: "Clear/Wipe input form states back to initial defaults after successful completion" } },
                  { name: "hide_undo_button", selector: { boolean: {} }, context: { label: "Hide the Undo Changes navigation action row" } }
                ] as any}
                .computeLabel=${this._computeLabel}
                @value-changed=${this._cardSettingsChanged}
              ></ha-form>
            `
          : nothing}

        ${this._activeTab === "fields"
          ? html`
              <form-card-editor-fields
                .hass=${this.hass}
                .fields=${this._config.fields ?? []}
                .maxColumns=${this._config.columns ?? 2}
                @value-changed=${this._fieldsListMutated}
              ></form-card-editor-fields>
            `
          : nothing}

        ${this._activeTab === "actions"
          ? html`
              <div class="actions-editor-container">
                <p class="action-help-text">
                  Define actions executed during form sequence triggers. These utilize standard Lovelace action schemas (e.g., calling services, navigation links, or triggering script sequences).
                </p>

                <div class="action-block">
                  <div class="action-title-header">On Submit Actions</div>
                  <hui-action-editor
                    .hass=${this.hass}
                    .config=${this._config.save_actions ? this._config.save_actions[0] : undefined}
                    .actions=${["call-service", "navigate", "url", "more-info", "none"]}
                    @value-changed=${(ev: CustomEvent) => this._actionHookMutated(ev, "save_actions")}
                  ></hui-action-editor>
                </div>

                 <div class="action-block">
                  <div class="action-title-header">On Success Actions</div>
                  <hui-action-editor
                    .hass=${this.hass}
                    .config=${this._config.success_actions ? this._config.success_actions[0] : undefined}
                    .actions=${["call-service", "navigate", "url", "more-info", "none"]}
                    @value-changed=${(ev: CustomEvent) => this._actionHookMutated(ev, "success_actions")}
                  ></hui-action-editor>
                </div>
              </div>

                <div class="action-block">
                  <div class="action-title-header">On Error Actions</div>
                  <hui-action-editor
                    .hass=${this.hass}
                    .config=${this._config.error_actions ? this._config.error_actions[0] : undefined}
                    .actions=${["call-service", "navigate", "url", "more-info", "none"]}
                    @value-changed=${(ev: CustomEvent) => this._actionHookMutated(ev, "error_actions")}
                  ></hui-action-editor>
                </div>

                <div class="action-block">
                  <div class="action-title-header">On Submission Progress Actions</div>
                  <hui-action-editor
                    .hass=${this.hass}
                    .config=${this._config.progress_actions ? this._config.progress_actions[0] : undefined}
                    .actions=${["call-service", "navigate", "url", "more-info", "none"]}
                    @value-changed=${(ev: CustomEvent) => this._actionHookMutated(ev, "progress_actions")}
                  ></hui-action-editor>
                </div>

               
            `
          : nothing}
      </div>
    `;
  }

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

  /**
   * Translates single UI action configurations into array arrays to fit the original card schema
   */
  private _actionHookMutated(ev: CustomEvent, actionArrayKey: string) {
    ev.stopPropagation();
    if (!this._config) return;

    const actionValue = ev.detail.value;
    
    // Wrap the returned single action config literal back inside an array collection
    const updatedConfig = {
      ...this._config,
      [actionArrayKey]: actionValue ? [actionValue] : []
    };

    fireEvent(this, "config-changed", { config: updatedConfig });
  }

  static get styles(): CSSResultGroup {
    return css`
      .tabs { display: flex; border-bottom: 1px solid var(--divider-color); margin-bottom: 16px; gap: 8px; }
      .tab { background: none; border: none; padding: 10px 16px; cursor: pointer; font-weight: 500; color: var(--secondary-text-color); display: flex; align-items: center; gap: 8px; border-bottom: 2px solid transparent; font-size: 14px; }
      .tab:hover { color: var(--primary-text-color); }
      .tab.active { color: var(--primary-color); border-bottom-color: var(--primary-color); }
      .panel-content { padding: 4px 0; }
      
      .actions-editor-container {
        display: flex;
        flex-direction: column;
        gap: 20px;
        margin-top: 8px;
      }
      .action-help-text {
        font-size: 13px;
        color: var(--secondary-text-color);
        margin: 0 0 8px 0;
        line-height: 1.4;
      }
      .action-block {
        border: 1px solid var(--divider-color);
        border-radius: 12px;
        padding: 16px;
        background-color: var(--secondary-background-color);
      }
      .action-title-header {
        font-size: 13px;
        font-weight: bold;
        color: var(--primary-color);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 14px;
      }
      ha-form {
        display: block;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "form-card-editor": FormCardEditor;
  }
}