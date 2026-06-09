import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { mdiPlus, mdiDrag } from "@mdi/js";

import type { HomeAssistant } from "home-assistant-types";
import type { FormCardField } from "../cards/form-card-config";
import { fireEvent } from "../utils";
import "./form-card-editor-field-row";

@customElement("form-card-editor-fields")
export class FormCardEditorFields extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public fields!: FormCardField[];
  @property({ type: Number }) public maxColumns = 4;

  protected render() {
    if (!this.fields) return nothing;

    return html`
      <div class="fields-container">
        <div class="fields-list">
          ${repeat(
      this.fields,
      (field) => field.name,
      (field, index) => html`
              <form-card-editor-field-row
                .hass=${this.hass}
                .field=${field}
                .index=${index}
                .maxColumns=${this.maxColumns}
                @field-changed=${this._onFieldUpdated}   @field-deleted=${this._onFieldDeleted}   >
                <div slot="handle" class="drag-handle">
                  <ha-svg-icon .path=${mdiDrag}></ha-svg-icon>
                </div>
              </form-card-editor-field-row>
            `
    )}
        </div>

        <button class="add-field-btn" @click=${this._addNewField}>
          <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>
          Add New Form Field Block
        </button>
      </div>
    `;
  }

  private _onFieldUpdated(ev: CustomEvent) {
    ev.stopPropagation();
    const index = ev.detail.index;
    const modifiedFieldData = ev.detail.value;

    const copyArray = [...this.fields];
    copyArray[index] = { ...copyArray[index], ...modifiedFieldData };

    fireEvent(this, "value-changed", { value: copyArray });
  }

  private _onFieldDeleted(ev: CustomEvent) {
    ev.stopPropagation();
    const targetIndex = ev.detail.index;
    const copyArray = this.fields.filter((_, idx) => idx !== targetIndex);

    fireEvent(this, "value-changed", { value: copyArray });
  }

  private _addNewField() {
    const defaultSlug = `input_field_${Date.now().toString().slice(-4)}`;
    const newFieldObject: FormCardField = {
      name: defaultSlug,
      label: "New Form Input Label",
      grid_span: 1,
      selector: { text: {} }
    };

    const copyArray = [...this.fields, newFieldObject];
    fireEvent(this, "value-changed", { value: copyArray });
  }

  static get styles(): CSSResultGroup {
    return css`
      .fields-container {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-top: 8px;
      }
      .fields-list {
        display: flex;
        flex-direction: column;
      }
      .drag-handle {
        padding: 8px;
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--secondary-text-color);
        transition: color 0.2s;
      }
      .drag-handle:hover {
        color: var(--primary-color);
      }
      .drag-handle:active {
        cursor: grabbing;
      }
      .add-field-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        background-color: transparent;
        color: var(--primary-color);
        border: 2px dashed var(--divider-color);
        border-radius: 12px;
        padding: 14px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease-in-out;
      }
      .add-field-btn:hover {
        background-color: rgba(var(--rgb-primary-color), 0.04);
        border-color: var(--primary-color);
      }
      .add-field-btn ha-svg-icon {
        width: 20px;
        height: 20px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "form-card-editor-fields": FormCardEditorFields;
  }

  // for fire event
  interface HASSDomEvents {
    "move-down": undefined;
    "move-up": undefined;
  }
}
