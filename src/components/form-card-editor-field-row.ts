import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { mdiDelete, mdiChevronDown, mdiChevronUp, mdiEyeOff, mdiAsterisk, mdiCodeBraces } from "@mdi/js";
import type { HomeAssistant } from "home-assistant-types";
import type { HaFormSchema } from "home-assistant-types/dist/components/ha-form/types";
import type { FormCardField } from "../cards/form-card-config";

@customElement("form-card-editor-field-row")
export class FormCardEditorFieldRow extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public field!: FormCardField;
  @property({ type: Number }) public index!: number;
  @property({ type: Number }) public maxColumns = 4;

  @state() private _expanded = false;

  // The curated array of Home Assistant Core selectors requested
  private readonly _selectorTypes = [
    { value: "text", label: "Text Input" },
    { value: "number", label: "Number Input / Slider" },
    { value: "boolean", label: "Boolean Toggle" },
    { value: "select", label: "Select (Dropdown/List)" },
    { value: "entity", label: "Entity Picker" },
    { value: "device", label: "Device Picker" },
    { value: "area", label: "Area Picker" },
    { value: "floor", label: "Floor Picker" },
    { value: "label", label: "Label Picker" },
    { value: "target", label: "Target (Area/Device/Entity)" },
    { value: "action", label: "Action Selector" },
    { value: "condition", label: "Condition Selector" },
    { value: "trigger", label: "Trigger Selector" },
    { value: "template", label: "Template Editor" },
    { value: "duration", label: "Duration/Time Span" },
    { value: "time", label: "Time" },
    { value: "date", label: "Date" },
    { value: "datetime", label: "Date & Time" },
    { value: "color_rgb", label: "RGB Color" },
    { value: "color_temp", label: "Color Temperature" },
    { value: "icon", label: "Icon Picker" },
    { value: "media", label: "Media Browser" },
    { value: "theme", label: "Theme Selector" },
    { value: "location", label: "GPS Location Map" },
    { value: "language", label: "Language Picker" },
    { value: "country", label: "Country Picker" },
    { value: "conversation_agent", label: "Assist Conversation Agent" },
    { value: "assist_pipeline", label: "Assist Pipeline" },
    { value: "backup_location", label: "Backup Location" },
    { value: "config_entry", label: "Integration Config Entry" },
    { value: "attribute", label: "State Attribute" },
    { value: "state", label: "State Picker" },
    { value: "statistic", label: "Long Term Statistic" },
    { value: "object", label: "YAML / JSON Object Editor" },
    { value: "qr_code", label: "QR Code Generator" },
    { value: "choose", label: "Choose Matrix Selector" },
    { value: "constant", label: "Constant Value Field" },
    { value: "app", label: "Application Selector" }
  ].sort((a, b) => a.label.localeCompare(b.label));

  private _computeLabel = (schema: HaFormSchema): string => {
    if (schema.context?.label) return schema.context.label;
    return schema.name ? schema.name.charAt(0).toUpperCase() + schema.name.slice(1).replace(/_/g, " ") : "";
  };

  /**
   * Identifies the primary active selector string key safely
   */
  private _getSelectorType(): string {
    if (!this.field.selector) return "text";
    const keys = Object.keys(this.field.selector);
    return keys[0] ?? "text";
  };

  /**
   * Flattens the metadata variables so they can be processed cleanly by <ha-form>
   */
  private _getMetadataValues() {
    return {
      name: this.field.name,
      label: this.field.label,
      description: this.field.description,
      required: this.field.required ?? false,
      grid_span: this.field.grid_span ?? 1,
      selector_type: this._getSelectorType(),
      depends_on: this.field.depends_on,
      show_if_value: this.field.show_if_value,
    };
  }

  protected render() {
    if (!this.field) return nothing;

    const metadata = this._getMetadataValues();
    const currentSelectorType = metadata.selector_type;
    const isTemplate = this.field.description?.includes("{{") || this.field.label?.includes("{{");

    return html`
      <div class="field-card ${this._expanded ? "expanded" : ""}">
        <div class="field-header">
          <div class="drag-handle-container">
            <slot name="handle"></slot>
          </div>
          
          <div class="field-summary" @click=${() => { this._expanded = !this._expanded; }}>
            <span class="field-index">#${this.index + 1}</span>
            <span class="field-title">
              ${this.field.label || this.field.name || "Unnamed Field"}
              ${this.field.required ? html`<ha-svg-icon class="req-star" .path=${mdiAsterisk}></ha-svg-icon>` : nothing}
            </span>
            <span class="field-slug">${this.field.name}</span>
          </div>

          <div class="field-badges">
            <span class="badge type-badge">${currentSelectorType}</span>
            <span class="badge span-badge">Span: ${metadata.grid_span}/${this.maxColumns}</span>
            ${isTemplate ? html`<span class="badge template-badge"><ha-svg-icon .path=${mdiCodeBraces}></ha-svg-icon> Template</span>` : nothing}
            ${this.field.depends_on ? html`<span class="badge cond-badge"><ha-svg-icon .path=${mdiEyeOff}></ha-svg-icon> Conditional</span>` : nothing}
          </div>

          <div class="field-actions">
            <ha-icon-button
              .path=${this._expanded ? mdiChevronUp : mdiChevronDown}
              @click=${() => { this._expanded = !this._expanded; }}
            ></ha-icon-button>
            <ha-icon-button
              class="delete-btn"
              .path=${mdiDelete}
              @click=${this._onDelete}
            ></ha-icon-button>
          </div>
        </div>

        ${this._expanded
          ? html`
              <div class="field-body">
                <div class="section-title">Field Metadata Options</div>
                <ha-form
                  .hass=${this.hass}
                  .data=${metadata}
                  .computeLabel=${this._computeLabel}
                  .schema=${[
                    { name: "name", selector: { text: {} }, context: { label: "Field Key Identifier Name / Slug" } },
                    { name: "label", selector: { text: {} }, context: { label: "Display Title Label (Supports Jinja)" } },
                    { name: "description", selector: { text: {} }, context: { label: "Helper Subtext (Supports Jinja)" } },
                    {
                      name: "selector_type",
                      selector: { select: { mode: "dropdown", options: this._selectorTypes } },
                      context: { label: "Form Input Selection Component Type" }
                    },
                    { name: "required", selector: { boolean: {} }, context: { label: "Mandatory Input Block" } },
                    {
                      name: "grid_span",
                      selector: { number: { min: 1, max: this.maxColumns, mode: "slider", step: 1 } },
                      context: { label: "Grid Columns Span Allocation" }
                    },
                    { name: "depends_on", selector: { text: {} }, context: { label: "Conditional Visibility Parent Trigger Field (Optional)" } },
                    { name: "show_if_value", selector: { text: {} }, context: { label: "Show Field Only When Parent Matches This Value" } }
                  ] as any}
                  @value-changed=${this._onMetadataMutation}
                ></ha-form>

                <div class="section-divider"></div>
                <div class="section-title">Advanced ${currentSelectorType.toUpperCase()} Parameters</div>
                <div class="selector-config-panel">
                  <p class="selector-help-text">
                    Configure specialized parameter parameters natively supplied by Home Assistant for this specific input block.
                  </p>
                  <ha-selector
                    .hass=${this.hass}
                    .selector=${{ selector: {} }} 
                    .value=${this.field.selector[currentSelectorType] ?? {}}
                    @value-changed=${this._onSelectorSubschemaMutation}
                  ></ha-selector>
                </div>

                ${isTemplate
                  ? html`
                      <div class="template-notice">
                        <ha-svg-icon .path=${mdiCodeBraces}></ha-svg-icon>
                        <span>Jinja rendering expressions detected. Layout elements evaluate real-time outputs live.</span>
                      </div>
                    `
                  : nothing}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  /**
   * Handles structural alterations to field parameters (names, spans, conditions)
   */
  private _onMetadataMutation(ev: CustomEvent) {
    ev.stopPropagation();
    const rawForm = ev.detail.value;
    const oldSelectorType = this._getSelectorType();
    const newSelectorType = rawForm.selector_type;

    // Retain settings dictionary if type matches, or build a fresh block for new selector types
    let structuralSelector: any = { ...this.field.selector };
    if (oldSelectorType !== newSelectorType) {
      structuralSelector = { [newSelectorType]: {} };
    }

    const updatedField: FormCardField = {
      name: rawForm.name,
      label: rawForm.label,
      description: rawForm.description,
      required: rawForm.required,
      grid_span: Number(rawForm.grid_span ?? 1),
      // FIX: Cast via "as any" to fulfill Home Assistant's rigid Selector union type constraints
      selector: structuralSelector
    };

    if (rawForm.depends_on) {
      updatedField.depends_on = rawForm.depends_on;
      updatedField.show_if_value = rawForm.show_if_value;
    }

    this._dispatchUpdate(updatedField);
  }

  /**
   * Catches advanced structural options fired from the subschema <ha-selector> interface
   */
  private _onSelectorSubschemaMutation(ev: CustomEvent) {
    ev.stopPropagation();
    const selectorType = this._getSelectorType();
    
    const updatedField: FormCardField = {
      ...this.field,
      // FIX: Coerce computed dynamic properties as any to satisfy type-checking
      selector: {
        [selectorType]: ev.detail.value ?? {}
      } as any
    };

    this._dispatchUpdate(updatedField);
  }

  private _dispatchUpdate(updatedField: FormCardField) {
    this.dispatchEvent(
      new CustomEvent("field-changed", {
        detail: { value: updatedField, index: this.index },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onDelete(ev: Event) {
    ev.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("field-deleted", {
        detail: { index: this.index },
        bubbles: true,
        composed: true,
      })
    );
  }

  static get styles(): CSSResultGroup {
    return css`
      .field-card {
        border: 1px solid var(--divider-color);
        border-radius: 12px;
        background-color: var(--card-background-color, var(--background-color-2));
        margin-bottom: 12px;
        overflow: hidden;
        transition: all 0.2s ease-in-out;
      }
      .field-card:hover { border-color: var(--primary-color); }
      .field-card.expanded {
        border-color: var(--primary-color);
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      }
      .field-header {
        display: flex;
        align-items: center;
        padding: 8px 16px;
        gap: 12px;
        min-height: 48px;
      }
      .drag-handle-container { display: flex; align-items: center; color: var(--secondary-text-color); }
      .field-summary {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        overflow: hidden;
      }
      .field-index {
        font-weight: bold;
        color: var(--primary-color);
        font-family: monospace;
        font-size: 13px;
        background: var(--secondary-background-color);
        padding: 2px 6px;
        border-radius: 4px;
      }
      .field-title { font-weight: 500; color: var(--primary-text-color); display: flex; align-items: center; gap: 4px; }
      .req-star { color: var(--error-color, #db4437); width: 10px; height: 10px; }
      .field-slug {
        font-size: 11px;
        color: var(--secondary-text-color);
        font-family: monospace;
        background: rgba(var(--rgb-primary-text-color), 0.05);
        padding: 1px 6px;
        border-radius: 4px;
      }
      .field-badges { display: flex; gap: 6px; align-items: center; }
      .badge {
        font-size: 10px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 20px;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .type-badge {
        background-color: var(--secondary-background-color);
        color: var(--primary-color);
        border: 1px solid var(--divider-color);
      }
      .span-badge { background-color: rgba(var(--rgb-primary-color), 0.1); color: var(--primary-color); }
      .template-badge { background-color: #e8f5e9; color: #2e7d32; }
      .template-badge ha-svg-icon { width: 12px; height: 12px; }
      .cond-badge { background-color: #fff3e0; color: #e65100; }
      .cond-badge ha-svg-icon { width: 12px; height: 12px; }
      .delete-btn { color: var(--error-color, #db4437); }
      .field-body {
        padding: 20px;
        border-top: 1px solid var(--divider-color);
        background-color: rgba(var(--rgb-card-background-color, 255, 255, 255), 0.2);
      }
      .section-title {
        font-size: 14px;
        font-weight: bold;
        color: var(--primary-text-color);
        margin-bottom: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .section-divider {
        height: 1px;
        background-color: var(--divider-color);
        margin: 20px 0;
      }
      .selector-config-panel {
        background-color: var(--secondary-background-color);
        padding: 16px;
        border-radius: 8px;
        border: 1px solid var(--divider-color);
      }
      .selector-help-text {
        font-size: 12px;
        color: var(--secondary-text-color);
        margin-top: 0;
        margin-bottom: 16px;
      }
      .template-notice {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 14px;
        padding: 10px 14px;
        background-color: #f4fbf7;
        border: 1px solid #c8e6c9;
        border-radius: 8px;
        color: #1b5e20;
        font-size: 12px;
      }
      .template-notice ha-svg-icon { width: 18px; height: 18px; flex-shrink: 0; }
    `;
  }
}
declare global {
  interface HTMLElementTagNameMap {
    "form-card-editor-field-row": FormCardEditorFieldRow;
  }
}
