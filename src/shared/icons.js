// src/shared/icons.js
// Small inline icon set (no external assets, no icon font dependency).
// Kept tiny and monochrome (currentColor) so they follow text colour everywhere they're used.

const ICONS = {
  tracks: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.6"/>
    <path d="M6.5 10.5H10M6.5 13.5H9M13.5 10.5H17.5M13.5 13.5H15.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,

  style: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3.5c-4.7 0-8.5 3.6-8.5 8s3.8 8 8.5 8c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16c2.5 0 4.5-2 4.5-4.5 0-3.4-3.8-6.1-8.5-6.1Z" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="7.3" cy="10.8" r="1.1" fill="currentColor"/>
    <circle cx="10.3" cy="7.6" r="1.1" fill="currentColor"/>
    <circle cx="14.3" cy="7.6" r="1.1" fill="currentColor"/>
    <circle cx="17" cy="10.8" r="1.1" fill="currentColor"/>
  </svg>`,

  behavior: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3.5 4.5 6.8v5.1c0 4.4 3.2 8.1 7.5 9.1 4.3-1 7.5-4.7 7.5-9.1V6.8L12 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M9 12.2l2 2 4-4.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  language: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/>
    <path d="M3.5 12h17M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5Z" stroke="currentColor" stroke-width="1.6"/>
  </svg>`,

  chevron: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  close: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  check: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  // Player button icon — two stacked lines of unequal length, echoing the
  // dual-subtitle overlay itself. Deliberately distinct from Jellyfin's
  // single-line "CC" glyph so the two buttons don't get confused at a glance.
  dualSubs: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4.5" width="16" height="15" rx="2.2" stroke="currentColor" stroke-width="1.5"/>
    <path d="M7 10.5H17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M7 14H13.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.6"/>
  </svg>`
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = ICONS;
}
