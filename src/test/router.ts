import { useMemo, useSyncExternalStore } from "react";
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => { listeners.delete(listener); window.removeEventListener("popstate", listener); };
}
export const testRouter = {
  push(href: string) { if (`${location.pathname}${location.search}${location.hash}` !== href) { history.pushState({}, "", href); notify(); } },
  replace(href: string) { history.replaceState({}, "", href); notify(); },
  back() { history.back(); },
  forward() { history.forward(); },
  refresh() {},
  prefetch() {},
};
export function resetTestRouter(href = "/gardens") { history.replaceState({}, "", href); notify(); }
export function useTestPathname() { return useSyncExternalStore(subscribe, () => location.pathname); }
export function useTestSearchParams() {
  const search = useSyncExternalStore(subscribe, () => location.search);
  return useMemo(() => new URLSearchParams(search), [search]);
}
