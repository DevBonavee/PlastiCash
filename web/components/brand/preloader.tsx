// First-load preloader: the PlastiCash mark centred on the page background, nothing else. Its markup and CSS are inline
// in the root layout's HTML, so it paints before any script or stylesheet arrives. PreloaderDone (client) marks
// <html data-loaded> after React's first render, which fades it out; it never comes back on in-app navigation because
// the root layout doesn't remount. Without JavaScript it fades by itself after 4 s.
// Background follows the theme next-themes sets before paint: white, or the dark canvas in dark mode. Its pre-paint
// script writes "dark" (React later maps it to "plasticash-dark"), so both are matched.

const css = `
#pc-preloader{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:#fff;
transition:opacity .3s ease,visibility 0s linear .3s;animation:pc-pre-out .3s ease 4s forwards}
[data-theme="plasticash-dark"] #pc-preloader,[data-theme="dark"] #pc-preloader{background:#0B1410}
@media (prefers-color-scheme:dark){html:not([data-theme]) #pc-preloader{background:#0B1410}}
[data-loaded] #pc-preloader{opacity:0;visibility:hidden;pointer-events:none}
#pc-preloader svg{width:72px;height:72px}
@media (prefers-reduced-motion:no-preference){#pc-preloader svg{animation:pc-pre-pulse 1.4s ease-in-out infinite}}
@keyframes pc-pre-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.92);opacity:.8}}
@keyframes pc-pre-out{to{opacity:0;visibility:hidden;pointer-events:none}}
`;

export function Preloader() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div id="pc-preloader" aria-hidden="true">
        {/* design/logo/plasticash-mark.svg */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
          <rect width="64" height="64" rx="18" fill="#15803D" />
          <rect x="26" y="7.5" width="12" height="6" rx="2" fill="#FFFFFF" />
          <path
            d="M27.5 15.5h9v3.2c0 1.6 1.1 2.6 2.6 3.7 2.4 1.7 4.9 3.9 4.9 8.1V50a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6V30.5c0-4.2 2.5-6.4 4.9-8.1 1.5-1.1 2.6-2.1 2.6-3.7z"
            fill="#FFFFFF"
          />
          <path d="M26.5 50V31.5l11 18.5V31.5" stroke="#15803D" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="13" y="36.5" width="38" height="3.8" rx="1.9" fill="#F59E0B" />
          <rect x="13" y="43" width="38" height="3.8" rx="1.9" fill="#F59E0B" />
        </svg>
      </div>
    </>
  );
}
