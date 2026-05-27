const ICONS: Record<string, string> = {
  shade:
    '<path d="M5 6h14v12H5z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 18v-4h8v4M7 10h10M7 13h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  bottle:
    '<path d="M10 3h4v4l2 3v10H8V10l2-3z" fill="currentColor"/><path d="M10 5h4" stroke="#0d0d0e" stroke-width="1.5"/>',
  circle:
    '<path d="M5.4 13a5.3 5.3 0 0 1 5.3-5.3h1.8v10.6H8.1a2.7 2.7 0 0 1-2.7-2.7z" fill="currentColor"/><circle cx="16" cy="12.3" r="5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="9.3" cy="11.3" r=".9" fill="#0d0d0e"/><path d="M11.5 14c.8-.5 1.6-.5 2.5-.1" fill="none" stroke="#0d0d0e" stroke-width="1.3" stroke-linecap="round"/>',
  dots:
    '<circle cx="8" cy="14" r="2.5" fill="currentColor"/><circle cx="14" cy="9" r="3.2" fill="currentColor"/><circle cx="14" cy="16" r="1.6" fill="currentColor"/>',
  cast:
    '<path d="M4 7h16v10h-4v-2h2V9H6v2H4z" fill="currentColor"/><path d="M4 13a6 6 0 0 1 6 6H8a4 4 0 0 0-4-4zm0 4a2 2 0 0 1 2 2H4z" fill="currentColor"/>',
  cloud:
    '<path d="M7 18a4 4 0 0 1 .5-7.97A5.5 5.5 0 0 1 18 11.5 3.5 3.5 0 0 1 17.5 18z" fill="currentColor"/>',
  cup:
    '<path d="M5 5h12v8a5 5 0 0 1-5 5H9a4 4 0 0 1-4-4z" fill="currentColor"/><path d="M17 7h2a2 2 0 0 1 0 4h-2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  co2:
    '<path d="M4 11.5a5.2 5.2 0 0 1 5.2-5.2h1.9a4.9 4.9 0 0 1 4.4 2.7H17a4 4 0 0 1 .5 8H8.8A4.8 4.8 0 0 1 4 12.2z" fill="currentColor"/><circle cx="8.4" cy="12.4" r="1.3" fill="#0d0d0e"/><circle cx="12" cy="12.4" r="1.3" fill="#0d0d0e"/><circle cx="15.8" cy="14.2" r="1.1" fill="#0d0d0e"/>',
  door:
    '<path d="M7 4h10v16H7z" fill="currentColor"/><path d="M5 20h14M10 12h1" stroke="#0d0d0e" stroke-width="2" stroke-linecap="round"/>',
  down:
    '<path d="M12 4v14m0 0 6-6m-6 6-6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  applianceAlt:
    '<rect x="5" y="3.5" width="14" height="17" rx="2" fill="currentColor"/><circle cx="12" cy="12.5" r="4.4" fill="#0d0d0e"/><path d="M10 12.5c1.4-1.2 2.6 1.2 4 0" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="8" cy="6.7" r="1" fill="#0d0d0e"/><circle cx="11" cy="6.7" r="1" fill="#0d0d0e"/>',
  droplet:
    '<path d="M12 3s7 7.2 7 12a7 7 0 0 1-14 0c0-4.8 7-12 7-12z" fill="currentColor"/><path d="M9 16c1.5 2 4.5 2 6 0" fill="none" stroke="#0d0d0e" stroke-width="1.6" stroke-linecap="round"/>',
  more:
    '<circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/>',
  mug:
    '<path d="M6 7h10v10H6z" fill="currentColor"/><path d="M16 9h2.2a2.8 2.8 0 0 1 0 5.6H16" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 5c0-1 1-1 1-2m3 2c0-1 1-1 1-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  music:
    '<path d="M9 18a3 3 0 1 1-2-2.83V6l10-2v11a3 3 0 1 1-2-2.83V8.3l-6 1.2z" fill="currentColor"/>',
  mascot:
    '<circle cx="6.3" cy="12.1" r="2.8" fill="currentColor"/><circle cx="17.7" cy="12.1" r="2.8" fill="currentColor"/><path d="M6.8 11.5a5.2 5.2 0 0 1 10.4 0v2.7a5.2 5.2 0 0 1-10.4 0z" fill="currentColor"/><path d="M8.7 13.7c0-1.9 1.4-3.1 3.3-3.1s3.3 1.2 3.3 3.1v1.1c0 1.7-1.4 3-3.3 3s-3.3-1.3-3.3-3z" fill="#0d0d0e"/><circle cx="10" cy="10.6" r=".9" fill="#0d0d0e"/><circle cx="14" cy="10.6" r=".9" fill="#0d0d0e"/><path d="M10.5 14.6c1 .7 2 .7 3 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  owl:
    '<path d="M4 5c3 2 5 2 8 0 3 2 5 2 8 0l-1 9-7 7-7-7z" fill="currentColor"/><circle cx="9" cy="12" r="2.2" fill="#0d0d0e"/><circle cx="15" cy="12" r="2.2" fill="#0d0d0e"/><path d="M12 15l2-2h-4z" fill="#0d0d0e"/>',
  pause:
    '<path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor"/>',
  play:
    '<path d="M8 5v14l11-7z" fill="currentColor"/>',
  playlist:
    '<path d="M5 7h9M5 11h9M5 15h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 14v5l4-2.5z" fill="currentColor"/>',
  pot:
    '<path d="M6 10h12v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill="currentColor"/><path d="M5 10h14M9 7c-2-2 2-2 0-4m6 4c-2-2 2-2 0-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  power:
    '<path d="M12 3v9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M7 6.8a8 8 0 1 0 10 0" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  previous:
    '<path d="M6 5h2v14H6zM19 5v14L9 12z" fill="currentColor"/>',
  shuffle:
    '<path d="M4 7h2.6c2.1 0 3.4 1 4.5 3l1.8 3.2c1 1.8 2.1 2.8 4 2.8H20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M17 13l3 3-3 3M4 17h2.6c1.6 0 2.7-.6 3.6-1.8M13.2 8.8C14.1 7.6 15.2 7 16.9 7H20M17 4l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  sink:
    '<path d="M6 11h12v3H6zM7 14h10v5H7z" fill="currentColor"/><path d="M7 10c1-3 4-4 8-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  skip:
    '<path d="M5 5v14l10-7zM17 5h2v14h-2z" fill="currentColor"/>',
  stop:
    '<path d="M8 8h8v8H8z" fill="currentColor"/>',
  string:
    '<path d="M5 8c5 3 9 3 14 0" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 9v5m4-4v6m4-6v6m4-7v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  table:
    '<path d="M5 7h14v3h-5v9h-4v-9H5z" fill="currentColor"/><path d="M7 19h4m2 0h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  thermometer:
    '<path d="M10 4a2 2 0 1 1 4 0v8.2a4 4 0 1 1-4 0z" fill="currentColor"/>',
  trash:
    '<path d="M7 8h10l-.8 12H7.8z" fill="currentColor"/><path d="M6 6h12M10 6V4h4v2M10 11v6m4-6v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  up:
    '<path d="M12 20V6m0 0 6 6m-6-6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  wall:
    '<path d="M4 5h16v14H4z" fill="currentColor"/><path d="M4 10h16M4 15h16M9 5v5m6 0v5M9 15v4" stroke="#0d0d0e" stroke-width="1.4"/>',
  appliance:
    '<rect x="5" y="3.5" width="14" height="17" rx="2" fill="currentColor"/><circle cx="12" cy="12.5" r="4.4" fill="#0d0d0e"/><path d="M8.7 12.5c2-1.4 4.6 1.4 6.6 0" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="8" cy="6.7" r="1" fill="#0d0d0e"/><circle cx="11" cy="6.7" r="1" fill="#0d0d0e"/>',
};

export function iconSvg(name: string, className = "icon"): string {
  const content = ICONS[name] ?? ICONS.playlist;
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${content}</svg>`;
}
