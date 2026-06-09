import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { mdiDelete, mdiChevronDown, mdiChevronUp, mdiEye, mdiEyeOff } from "@mdi/js";
import type { HomeAssistant } from "home-assistant-types";
import type { HaFormSchema } from "home-assistant-types/dist/components/ha-form/types";
import type { FormCardField } from "../cards/form-card-config";
import { fireEvent } from "../utils";

@customElement("form-card-editor-field-row")
export class FormCardEditorFieldRow extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public field!: FormCardField;
  @property({ type: Number }) public index!: number;
  @property({ type: Number }) public maxColumns = 4;

  @state() private _expanded = false;

  private _computeLabel = (schema: HaFormSchema): string => {
    if (schema.context?.label) return schema.context.label;
    return schema.name ? schema.name.charAt(0).toUpperCase() + schema.name.slice(1).replace(/_/g, " ") : "";
  };

  protected render() {
    if (!this.field) return nothing;

    const span = this.field.grid_span ?? 1;
    const hasCondition = !!this.field.depends_on;

    return html`
      <div class="field-card ${this._expanded ? "expanded" : ""}">
        <div class="field-header">
          <div class="drag-handle-container">
            <slot name="handle"></slot>
          </div>
          
          <div class="field-summary" @click=${() => { this._expanded = !this._expanded; }}>
            <span class="field-index">#${this.index + 1}</span>
            <span class="field-title">${this.field.label || this.field.name || "Unnamed Field"}</span>
            <span class="field-slug">${this.field.name}</span>
          </div>

          <div class="field-badges">
            <span class="badge span-badge">Span: ${span}/${this.maxColumns}</span>
            ${hasCondition ? html`<span class="badge cond-badge"><ha-svg-icon .path=${mdiEyeOff}></ha-svg-icon> Conditional</span>` : nothing}
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
                <ha-form
                  .hass=${this.hass}
                  .data=${this.field}
                  .computeLabel=${this._computeLabel}
                  .schema=${[
                    { name: "name", selector: { text: {} }, context: { label: "Unique Identifier Slug (lowercase, no spaces)" } },
                    { name: "label", selector: { text: {} }, context: { label: "Display Label text" } },
                    { name: "description", selector: { text: {} }, context: { label: "Helper / Description Text" } },
                    {
                      name: "grid_span",
                      selector: { number: { min: 1, max: this.maxColumns, mode: "slider", step: 1 } },
                      context: { label: "Column Width Grid Span Allocation" }
                    },
                    { name: "depends_on", selector: { text: {} }, context: { label: "Conditional Parent Field Name (Optional)" } },
                    { name: "show_if_value", selector: { text: {} }, context: { label: "Display Only When Parent Equals Value" } }
                  ] as any}
                  @value-changed=${this._onFieldMutation}
                ></ha-form>
              </div>
            `
          : nothing}
      </div>
    `;
  }

private _onFieldMutation(ev: CustomEvent) {
    ev.stopPropagation();
    const mutations = { ...ev.detail.value };
    if (mutations.grid_span) {
      mutations.grid_span = Number(mutations.grid_span);
    }
    
    // FIX: Dispatch a standard native custom event to bubble the payload and index safely
    this.dispatchEvent(
      new CustomEvent("field-changed", {
        detail: { value: mutations, index: this.index },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onDelete(ev: Event) {
    ev.stopPropagation();
    
    // FIX: Dispatch a standard native custom event to pass the deletion message up safely
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
        transition: all 0.25s ease-in-out;
        box-shadow: var(--ha-card-box-shadow, none);
      }
      .field-card:hover {
        border-color: var(--primary-color);
      }
      .field-card.expanded {
        border-color: var(--primary-color);
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      }
      .field-header {
        display: flex;
        align-items: center;
        padding: 8px 16px;
        gap: 12px;
        min-height: 48px;
      }
      .drag-handle-container {
        display: flex;
        align-items: center;
        color: var(--secondary-text-color);
      }
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
        font-size: 14px;
        background: var(--secondary-background-color);
        padding: 2px 6px;
        border-radius: 4px;
      }
      .field-title {
        font-weight: 500;
        color: var(--primary-text-color);
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
      }
      .field-slug {
        font-size: 12px;
        color: var(--secondary-text-color);
        font-family: monospace;
        background: rgba(var(--rgb-primary-text-color), 0.05);
        padding: 1px 6px;
        border-radius: 4px;
      }
      .field-badges {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .badge {
        font-size: 11px;
        font-weight: 600;
        padding: 4px 8px;
        border-radius: 20px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .span-badge {
        background-color: rgba(var(--rgb-primary-color), 0.1);
        color: var(--primary-color);
      }
      .cond-badge {
        background-color: #fff3e0;
        color: #e65100;
      }
      .cond-badge ha-svg-icon {
        width: 14px;
        height: 14px;
      }
      .field-actions {
        display: flex;
        align-items: center;
      }
      .delete-btn {
        color: var(--error-color, #db4437);
      }
      .field-body {
        padding: 20px;
        border-top: 1px solid var(--divider-color);
        background-color: rgba(var(--rgb-card-background-color, 255, 255, 255), 0.4);
      }
      ha-form {
        display: block;
      }
    `;
  }
}
declare global {
  interface HTMLElementTagNameMap {
    "form-card-editor-field-row": FormCardEditorFieldRow;
  }
}
