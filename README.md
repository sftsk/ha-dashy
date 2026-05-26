# Dashy Home Assistant Kiosk Panel

A lightweight Home Assistant custom panel for portrait wall tablets. It uses a vanilla TypeScript custom element, the Home Assistant-provided `hass` object, and a static Vite bundle.
Main reasons for this to exist:

- optimsitic UI -> shows new state before confirmed by HA
- very ressource optimised, works on weak tablets like Shelly X2 wall display

## Develop

```sh
npm install
npm run dev
```

The dev page at `http://127.0.0.1:5173/` loads a mock Home Assistant state object so the dashboard can be tested without a live Home Assistant instance.

## Configure Entities

The bundled `src/config.ts` values are public-safe placeholders. For a real
Home Assistant install, pass your own entity IDs through `panel_custom` config
instead of committing private room, device, or automation names. The dashboard
supports:

- Weather summary
- Combined temperature and humidity live-session chart
- Scene/control tiles
- Device control rows
- Conditional media card

The media card shows the most recently active playing player from `media.players`. Sonos can be configured through `media.sonos`; real Sonos music playback takes over the card, TV relay playback is ignored, and the idle state shows the first Sonos favorites before falling back to `idlePlaylistButtons`.

The public template is available in `dashy.config.sample.json`. For local
private settings, keep a copy at `dashy.config.local.json`; that file is ignored
by Git and should not be pushed.

## Build And Deploy

```sh
npm run build
```

Copy the generated file to Home Assistant:

```sh
cp dist/dashy-dashboard-panel.js /config/www/dashy-dashboard-panel.js
```

Register it in `configuration.yaml`:

```yaml
panel_custom:
  - name: dashy-dashboard-panel
    url_path: dashy
    sidebar_title: Dashy
    sidebar_icon: mdi:view-dashboard
    module_url: /local/dashy-dashboard-panel.js
```

Restart Home Assistant after adding the panel registration.
