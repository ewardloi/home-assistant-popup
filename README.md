# HA Custom Popup

A single Lovelace resource (`popup.js`) that lets you open **any Lovelace
card** in a popup that looks and behaves exactly like Home Assistant's own
`more-info` dialog - same open/close animation, same mobile-vs-desktop
layout, same rounded corners and safe-area handling - because it's built
directly on `ha-adaptive-dialog`, the same internal component `more-info`
itself uses.

You only supply the **content** (any Lovelace card config). Home Assistant's
own dialog logic handles everything else.

## What's in the box

- `popup-dialog` - the actual popup. Not used directly in YAML; opened
  programmatically.
- `popup-definition` - a card you place in your dashboard YAML to declare a
  popup's content and give it an `id`. Invisible on the live dashboard;
  shows a live preview of the real content while you're in dashboard edit
  mode.
- A global click handler that lets **any** card's `tap_action` /
  `hold_action` / `double_tap_action` open a popup via `fire-dom-event`.
- URL support: opening a dashboard with `?popup=<id>` in the address bar
  auto-opens that popup once the page has loaded.

## Installation

1. Copy `popup.js` to your Home Assistant `www` folder, e.g.
   `/config/www/popup/popup.js` (any subfolder is fine - the import path is
   resolved automatically from wherever the file actually loads).
2. Add it as a Lovelace resource:

   **Settings → Dashboards → ⋮ (top right) → Resources → Add Resource**

   | Field | Value |
   |---|---|
   | URL | `/local/popup/popup.js` (or wherever you placed it) |
   | Resource type | JavaScript Module |

3. Hard-refresh your browser (Ctrl+Shift+R / Cmd+Shift+R) after installing
   or updating the file - browsers aggressively cache JS modules.

No other resource or dependency is needed - everything lives in this one
file.

## Declaring a popup

Add a `popup-definition` card anywhere in your dashboard YAML. It renders
nothing on the live dashboard; in edit mode it shows a dashed preview box
with the actual card inside, so you can see exactly what the popup will
look like while you build it.

```yaml
- type: custom:popup-definition
  id: lg_tv_remote          # required - how you'll reference this popup
  title: LG TV Remote       # optional - shown in the popup header
  card:                     # required - any valid Lovelace card config
    type: custom:universal-remote-card
    rows:
      - - power
      # ...
```

`id` must be unique across your dashboard. `card` can be any Lovelace card
config, including `stack-card`, `entities`, or a custom card - whatever you
put here is rendered verbatim inside the popup via Home Assistant's own
`createCardElement` helper.

> **Note:** Home Assistant only builds the cards belonging to the
> currently active **view**. A `popup-definition` only registers itself
> once its own view has been rendered - so if you plan to deep-link into a
> popup via URL, keep its `popup-definition` in the view that URL will
> land on.

## Triggering a popup

Any card whose action config supports `fire-dom-event` - `tile`, `button`,
`picture`, `area`, `entities` rows, custom cards built on `handleAction`,
etc. - can open a popup by referencing its `id`:

```yaml
type: tile
entity: media_player.living_room_remote_google_tv
tap_action:
  action: fire-dom-event
  popup:
    id: lg_tv_remote
```

This works the same way for `hold_action` and `double_tap_action` if you
want different content on a long-press.

You can also open a registered popup by navigating to its URL parameter:

```yaml
tap_action:
  action: navigate
  navigation_path: ?popup=google_tv_remote
```

This approach uses the standard navigation action and avoids breaking the
card's visual UI editor, which can happen with `fire-dom-event` on some cards.

### One-off inline popups (no `id`, not URL-openable)

If you don't need to reuse or deep-link to a popup, you can skip
`popup-definition` entirely and inline the card config directly in the
trigger:

```yaml
tap_action:
  action: fire-dom-event
  popup:
    title: Quick Info
    card:
      type: entities
      entities:
        - sensor.living_room_temperature
```

## Opening a popup from a URL

Once a popup is registered (via `popup-definition` on the loaded view),
you can open it directly by adding a `popup` query parameter to any
dashboard URL:

```
https://homeassistant.local/lovelace/0?popup=lg_tv_remote
```

This is checked on initial page load and again on in-app navigation
between views/dashboards, so it also works if you're already inside the
frontend and click a link that adds `?popup=...` to the address.

## Customizing the popup's appearance

The popup uses `<ha-adaptive-dialog>` with no extra CSS by default, so it
inherits Home Assistant's native look automatically. Two tokens are set in
`PopupDialog`'s styles to match `ha-more-info-dialog`'s own vertical
positioning:

```js
ha-adaptive-dialog {
  --dialog-surface-margin-top: var(--ha-space-10);
  --mdc-dialog-max-height: calc(100svh - var(--dialog-surface-margin-top) - var(--ha-space-2) - var(--safe-area-inset-y, 0px));
  --ha-dialog-max-height: calc(100svh - var(--dialog-surface-margin-top) - var(--ha-space-2) - var(--safe-area-inset-y, 0px));
}
```

If a future Home Assistant release changes these values, open DevTools on
a native `more-info` dialog, inspect its computed custom properties, and
update the block above to match.

You can also pass a `width` in `dialogParams` (`"medium"` | `"large"` |
`"full"`) - currently only settable by editing `popup.js`'s
`openPopup()`/`openPopupById()` calls if you want per-popup control; by
default every popup opens at `"medium"`.
