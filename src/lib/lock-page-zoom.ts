let installed = false

export function lockPageZoom() {
  if (installed || typeof document === 'undefined') return
  installed = true

  const preventDefault = (event: Event) => event.preventDefault()
  for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(eventName, preventDefault, { passive: false })
  }

  const blockPinch = (event: Event) => {
    const touches = (event as TouchEvent).touches
    if (touches && touches.length > 1) event.preventDefault()
  }
  document.addEventListener('touchstart', blockPinch, { passive: false })
  document.addEventListener('touchmove', blockPinch, { passive: false })
}
