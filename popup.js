await customElements.whenDefined("ha-panel-lovelace");

const HaLitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));

const LitElement = HaLitElement;
const html = HaLitElement.prototype.html;
const css = HaLitElement.prototype.css;

window.HAPopups = window.HAPopups || {};

const SELF_URL = import.meta.url;

function getHassRoot() {
  return document.querySelector("home-assistant");
}

function getHass() {
  return getHassRoot()?.hass;
}

const BORDERLESS_CSS = `ha-card {
  border-style: none;
}`;

function appendStyle(existing, extra) {
  if (existing === undefined || existing === null || existing === "") return extra;
  if (typeof existing !== "string") return existing;
  return `${existing}\n${extra}`;
}

function withoutBorder(card) {
  if (!card || typeof card !== "object") return card;

  const next = { ...card };

  next.styles = appendStyle(card.styles, BORDERLESS_CSS);

  const cardMod = card.card_mod && typeof card.card_mod === "object" ? card.card_mod : {};
  next.card_mod = { ...cardMod, style: appendStyle(cardMod.style, BORDERLESS_CSS) };

  return next;
}

function effectiveCard(config) {
  return config?.hide_border ? withoutBorder(config.card) : config?.card;
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
          card: effectiveCard(config),
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

if (document.readyState === "complete" || document.readyState === "interactive") {
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
      pointer-events: none;
    }

    .placeholder {
      padding: 8px;
      font-size: 13px;
      opacity: 0.7;
    }
  `;

  static getConfigElement() {
    return document.createElement("popup-definition-editor");
  }

  static getStubConfig() {
    return { id: "my_popup", title: "" };
  }

  setConfig(config) {

    this._config = config || {};

    this._register();
    this._buildPreviewCard();
  }

  updated(changed) {
    if (changed.has("hass") && this._cardEl) {
      this._cardEl.hass = this.hass;
    }
  }

  _register() {

    if (this._registeredId && this._registeredId !== this._config.id) {
      delete window.HAPopups[this._registeredId];
      this._registeredId = undefined;
    }

    if (!this._config.id || !this._config.card) return;

    window.HAPopups[this._config.id] = {
      title: this._config.title,
      card: this._config.card,
      hide_border: !!this._config.hide_border,
    };

    this._registeredId = this._config.id;
  }

  async _buildPreviewCard() {
    const card = effectiveCard(this._config);

    if (!card?.type) {
      this._cardEl = undefined;
      this.requestUpdate();
      return;
    }

    const config = this._config;
    const helpers = await window.loadCardHelpers();

    if (config !== this._config) return;

    this._cardEl = helpers.createCardElement(card);

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

    const missing = [
      !this._config?.id ? "id" : null,
      !this._config?.card?.type ? "card" : null,
    ].filter(Boolean);

    return html`
      <div class="preview-wrap">
        <div class="preview-label">
          <ha-icon icon="mdi:window-restore"></ha-icon>
          <span>Popup preview: <strong>${this._config?.id || "—"}</strong></span>
          ${this._config?.title
            ? html`<span class="sub">— ${this._config.title}</span>`
            : ""}
        </div>
        ${missing.length
          ? html`<div class="placeholder">Not configured yet: ${missing.join(", ")}</div>`
          : html`<div class="preview-body">${this._cardEl}</div>`}
      </div>
    `;
  }
}

customElements.define("popup-definition", PopupDefinition);

let _cardEditorsPromise;

function loadCardEditors() {
  if (!_cardEditorsPromise) {
    _cardEditorsPromise = (async () => {
      if (
        customElements.get("hui-card-picker") &&
        customElements.get("hui-card-element-editor")
      ) {
        return;
      }

      const helpers = await window.loadCardHelpers();

      helpers.createCardElement({ type: "vertical-stack", cards: [] });

      await customElements.whenDefined("hui-vertical-stack-card");
      await customElements.get("hui-vertical-stack-card").getConfigElement();
      await customElements.whenDefined("hui-card-picker");
      await customElements.whenDefined("hui-card-element-editor");
    })().catch((err) => {
      _cardEditorsPromise = undefined;
      console.error("[popup] Could not load the card editor components", err);
      throw err;
    });
  }

  return _cardEditorsPromise;
}

const EDITOR_LABELS = {
  title: "Title",
  id: "ID",
  hide_border: "Remove border from the inner card",
};

const EDITOR_SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "id", required: true, selector: { text: {} } },
  { name: "hide_border", selector: { boolean: {} } },
];

class PopupDefinitionEditor extends LitElement {
  static properties = {
    hass: {},
    lovelace: {},
    _config: { state: true },
    _editorsReady: { state: true },
    _editorsFailed: { state: true },
  };

  static styles = css`
    .section-title {
      margin: 16px 0 8px;
      font-weight: 500;
      font-size: 14px;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 16px 0 8px;
    }

    .card-header .section-title {
      margin: 0;
    }

    .hint {
      font-size: 12px;
      opacity: 0.7;
    }
  `;

  setConfig(config) {
    this._config = config || {};
  }

  connectedCallback() {
    super.connectedCallback();

    loadCardEditors().then(
      () => (this._editorsReady = true),
      () => (this._editorsFailed = true)
    );
  }

  _fire(config) {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
  }

  _update(patch) {
    const config = { ...this._config, ...patch };

    for (const key of Object.keys(config)) {
      if (config[key] === undefined) delete config[key];
    }
    if (!config.hide_border) delete config.hide_border;
    if (!config.title) delete config.title;

    this._config = config;
    this._fire(config);
  }

  _formChanged(ev) {
    ev.stopPropagation();

    const { title, id, hide_border } = ev.detail.value;

    this._update({ title, id, hide_border });
  }

  _cardPicked(ev) {
    ev.stopPropagation();

    if (!ev.detail?.config) return;

    this._update({ card: ev.detail.config });
  }

  _cardChanged(ev) {
    ev.stopPropagation();

    if (!ev.detail?.config) return;

    this._update({ card: ev.detail.config });
  }

  _changeCard() {
    this._update({ card: undefined });
  }

  _renderCardSection() {
    if (this._editorsFailed) {
      return html`<div class="hint">
        Could not load the card editor. Edit the <code>card</code> key in YAML.
      </div>`;
    }

    if (!this._editorsReady) {
      return html`<div class="hint">Loading…</div>`;
    }

    const card = this._config.card;

    if (!card?.type) {
      return html`
        <div class="section-title">Card</div>
        <hui-card-picker
          .hass=${this.hass}
          .lovelace=${this.lovelace}
          @config-changed=${this._cardPicked}
        ></hui-card-picker>
      `;
    }

    return html`
      <div class="card-header">
        <span class="section-title">Card: ${card.type}</span>
        <ha-button @click=${this._changeCard}>Change card</ha-button>
      </div>
      <hui-card-element-editor
        .hass=${this.hass}
        .lovelace=${this.lovelace}
        .value=${card}
        @config-changed=${this._cardChanged}
      ></hui-card-element-editor>
    `;
  }

  render() {
    if (!this.hass || !this._config) return html``;

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{
          title: this._config.title ?? "",
          id: this._config.id ?? "",
          hide_border: !!this._config.hide_border,
        }}
        .schema=${EDITOR_SCHEMA}
        .computeLabel=${(schema) => EDITOR_LABELS[schema.name] ?? schema.name}
        @value-changed=${this._formChanged}
      ></ha-form>

      ${this._renderCardSection()}
    `;
  }
}

customElements.define("popup-definition-editor", PopupDefinitionEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "popup-definition",
  name: "Popup definition",
  description: "Declares a popup (id + any Lovelace card) that can be opened from tap actions or ?popup=<id>.",
  preview: false,
});

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

    setTimeout(removePopupFromUrl, 100);

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
