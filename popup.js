import { LitElement, html, css } from "https://unpkg.com/lit@2?module";

window.HAPopups = window.HAPopups || {};

const SELF_URL = import.meta.url;

function getHassRoot() {
  return document.querySelector("home-assistant");
}

function getHass() {
  return getHassRoot()?.hass;
}

function openPopup(config) {
  const haMain = getHassRoot();

  if (!haMain) return;
  
  haMain.dispatchEvent(
    new CustomEvent("show-dialog", {
      bubbles: true,
      composed: true,
      detail: {
        dialogTag: "popup-dialog",
        dialogImport: () => import(SELF_URL),
        dialogParams: {
          hass: getHass(),
          title: config.title,
          card: config.card,
        },
      },
    })
  );
}

function openPopupById(id, { retry = true } = {}) {
  const config = window.HAPopups[id];
  
  if (config) {
    openPopup(config);
    return;
  }
  
  if (!retry) {
    return;
  }
  
  let attempts = 0;

  const wait = () => {
    attempts++;

    if (window.HAPopups[id]) {
      openPopup(window.HAPopups[id]);
    } else if (attempts < 50) {
      requestAnimationFrame(wait);
    } else {
      console.warn(`[popup] No registered popup with id "${id}"`);
    }
  };

  wait();
}

window.addEventListener("ll-custom", (ev) => {
  const config = ev.detail;

  if (!config?.popup) return;

  if (config.popup.id) {
    openPopupById(config.popup.id);
  } else if (config.popup.card) {
    openPopup(config.popup);
  }
});

function removePopupFromUrl() {
  const url = new URL(window.location.href);

  if (!url.searchParams.has("popup")) return;

  url.searchParams.delete("popup");
  window.history.replaceState(window.history.state, "", url);
}

function checkUrlForPopup() {
  const params = new URLSearchParams(window.location.search);

  const id = params.get("popup");

  if (!id) return;

  const tryOpen = () => {
    if (getHass()) {
      openPopupById(id);
    } else {
      requestAnimationFrame(tryOpen);
    }
  };

  tryOpen();
}

if (document.readyState === "complete" || document.readyState === "interactive" ) {
  checkUrlForPopup();
} else {
  window.addEventListener("DOMContentLoaded", checkUrlForPopup);
}

window.addEventListener("location-changed", checkUrlForPopup);

class PopupDefinition extends LitElement {
  static properties = {
    hass: {},
    editMode: { type: Boolean },
    _config: { state: true },
  };

  static styles = css`
    .preview-wrap {
      border: 1px dashed var(--divider-color, #888);
      border-radius: var(--ha-card-border-radius, 12px);
      padding: 8px;
    }

    .preview-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      opacity: 0.7;
      padding: 4px 8px 8px;
    }
    
    .preview-body {
      pointer-events: none; /* preview only, avoid accidental taps while editing */
    }
  `;

  setConfig(config) {
    if (!config.id) throw new Error("popup-definition requires an 'id'");

    if (!config.card) throw new Error("popup-definition requires a 'card'");

    this._config = config;

    this._register();
    this._buildPreviewCard();
  }

  updated(changed) {
    if (changed.has("_config")) {
      this._register();
    }

    if (changed.has("hass") && this._cardEl) {
      this._cardEl.hass = this.hass;
    }
  }

  _register() {
    window.HAPopups[this._config.id] = {
      title: this._config.title,
      card: this._config.card,
    };
  }

  async _buildPreviewCard() {
    const helpers = await window.loadCardHelpers();

    this._cardEl = helpers.createCardElement(this._config.card);

    if (this.hass) this._cardEl.hass = this.hass;

    this.requestUpdate();
  }

  getCardSize() {
    return this.editMode ? (this._cardEl?.getCardSize?.() ?? 3) : 0;
  }

  render() {
    if (!this.editMode) {
      return html``;
    }

    return html`
      <div class="preview-wrap">
        <div class="preview-label">
          <ha-icon icon="mdi:window-restore"></ha-icon>
          <span>Popup preview: <strong>${this._config.id}</strong></span>
          ${this._config.title
            ? html`<span class="sub">— ${this._config.title}</span>`
            : ""}
        </div>
        <div class="preview-body">${this._cardEl}</div>
      </div>
    `;
  }
}

customElements.define("popup-definition", PopupDefinition);

class PopupDialog extends LitElement {
  static properties = { hass: {}, _params: {} };

  static styles = css`
    ha-adaptive-dialog {
      --dialog-surface-margin-top: var(--ha-space-10);
      --mdc-dialog-max-height: calc(
        100svh - var(--dialog-surface-margin-top) - var(--ha-space-2) -
          var(--safe-area-inset-y, 0px)
      );
      --ha-dialog-max-height: calc(
        100svh - var(--dialog-surface-margin-top) - var(--ha-space-2) -
          var(--safe-area-inset-y, 0px)
      );
    }
  `;

  showDialog(params) {
    this._params = params;
    this.hass = params.hass;
    this._buildCard();
  }

  async _buildCard() {
    if (!this._params?.card) return;

    const helpers = await window.loadCardHelpers();

    this._cardEl = helpers.createCardElement(this._params.card);
    this._cardEl.hass = this.hass;

    this.requestUpdate();
  }

  updated(changed) {
    if (changed.has("hass") && this._cardEl) {
      this._cardEl.hass = this.hass;
    }
  }

  closeDialog() {
    this._params = undefined;
    this._cardEl = undefined;

    this.dispatchEvent(
      new CustomEvent("dialog-closed", {
        bubbles: true,
        composed: true,
        detail: { dialog: this.localName },
      })
    );

    setTimeout(removePopupFromUrl, 100)

    return true;
  }

  render() {
    if (!this._params) return html``;
 
    return html`
      <ha-adaptive-dialog
        open
        .width=${this._params.width || "medium"}
        @closed=${this.closeDialog}
        flexcontent
      >
        <ha-icon-button
          slot="headerNavigationIcon"
          .label=${"Close"}
          @click=${this.closeDialog}
        >
          <ha-icon icon="mdi:close"></ha-icon>
        </ha-icon-button>
        <span slot="headerTitle">${this._params.title || ""}</span>
        ${this._cardEl}
      </ha-adaptive-dialog>
    `;
  }
}

customElements.define("popup-dialog", PopupDialog);