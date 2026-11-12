let locks = 0;
let previousOverflow = "";

/** Nested confirmations must not unlock the underlying editor's page. */
export function lockBodyScroll() {
  if (locks++ === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  return () => { if (--locks === 0) document.body.style.overflow = previousOverflow; };
}
