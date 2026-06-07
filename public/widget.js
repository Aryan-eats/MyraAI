(function () {
  "use strict"

  if (typeof document === "undefined") {
    return
  }

  const script = document.currentScript
  if (!script) {
    console.error("[MyraAI] widget script tag could not be identified")
    return
  }

  const botId = script.getAttribute("data-bot-id")
  if (!botId) {
    console.error("[MyraAI] Missing data-bot-id attribute")
    return
  }

  const scriptUrl = new URL(script.src)
  const baseUrl = `${scriptUrl.protocol}//${scriptUrl.host}`

  const iframe = document.createElement("iframe")
  iframe.src = `${baseUrl}/embed?botId=${encodeURIComponent(botId)}`
  iframe.title = "Myra AI Chat"
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.cssText = [
    "position: fixed",
    "right: 24px",
    "bottom: 88px",
    "width: 420px",
    "height: 640px",
    "border: 0",
    "border-radius: 20px",
    "box-shadow: 0 24px 60px rgba(15, 23, 42, 0.2)",
    "z-index: 2147483646",
    "display: none",
    "background: transparent",
    "overflow: hidden",
  ].join(";")

  const button = document.createElement("button")
  button.type = "button"
  button.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5.5C4 4.12 5.12 3 6.5 3h11C18.88 3 20 4.12 20 5.5v8c0 1.38-1.12 2.5-2.5 2.5H10l-4.4 4v-4H6.5C5.12 16 4 14.88 4 13.5v-8Z" fill="currentColor"/>
    </svg>
  `
  button.style.cssText = [
    "position: fixed",
    "right: 24px",
    "bottom: 24px",
    "width: 56px",
    "height: 56px",
    "border: 0",
    "border-radius: 9999px",
    "background: #6366f1",
    "color: white",
    "cursor: pointer",
    "z-index: 2147483647",
    "box-shadow: 0 16px 40px rgba(99, 102, 241, 0.35)",
    "display: flex",
    "align-items: center",
    "justify-content: center",
  ].join(";")

  let isOpen = false

  function setOpen(nextOpen) {
    isOpen = nextOpen
    iframe.style.display = isOpen ? "block" : "none"
    button.innerHTML = isOpen
      ? `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>
      `
      : `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 5.5C4 4.12 5.12 3 6.5 3h11C18.88 3 20 4.12 20 5.5v8c0 1.38-1.12 2.5-2.5 2.5H10l-4.4 4v-4H6.5C5.12 16 4 14.88 4 13.5v-8Z" fill="currentColor"/>
        </svg>
      `
  }

  button.addEventListener("click", function () {
    setOpen(!isOpen)
  })

  window.addEventListener("message", function (event) {
    const data = event.data || {}
    if (data.type === "myra:close") {
      setOpen(false)
    }
    if (data.type === "myra:color" && typeof data.color === "string") {
      button.style.background = data.color
    }
  })

  if (document.body) {
    document.body.appendChild(iframe)
    document.body.appendChild(button)
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      document.body.appendChild(iframe)
      document.body.appendChild(button)
    })
  }
})()
