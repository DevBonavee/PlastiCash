export type LinkClick = {
  button: number;
  /** Ctrl, Cmd, Shift or Alt held: the browser opens a new tab or window, or downloads. */
  modified: boolean;
  target: string;
  download: boolean;
};

/**
 * Whether clicking this link replaces the current page with a different one on this site. Filters, tabs and anchors on
 * the same pathname don't count, and neither do other origins or clicks that leave this tab alone.
 */
export function opensNewPage(href: string, here: string, click: LinkClick): boolean {
  if (click.button !== 0 || click.modified || click.download) return false;
  if (click.target && click.target !== "_self") return false;
  try {
    const from = new URL(here);
    const to = new URL(href, from);
    return to.origin === from.origin && to.pathname !== from.pathname;
  } catch {
    return false;
  }
}
