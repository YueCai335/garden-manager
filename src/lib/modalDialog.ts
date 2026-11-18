import { lockBodyScroll } from "./modalScrollLock";

/**
 * Opens a native <dialog> as a modal with the page scroll locked. The returned function
 * closes it and, on the next frame, returns focus to `returnTo()`. Focus stays where it is
 * when another dialog has opened meanwhile or the user has already moved it outside this
 * dialog, so a later screen never loses its focus to a stale opener.
 */
export function openModalDialog(node: HTMLDialogElement, returnTo: () => HTMLElement | null | undefined) {
  const unlock = lockBodyScroll();
  node.showModal();
  return () => {
    node.close();
    unlock();
    requestAnimationFrame(() => {
      if (document.querySelector("dialog[open]")) return;
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected && !node.contains(active)) return;
      const target = returnTo();
      if (target?.isConnected && !target.matches(":disabled")) target.focus();
    });
  };
}
