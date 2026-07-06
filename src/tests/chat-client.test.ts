import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@theme/colors", () => ({ uiColors: { brand: "#000" } }))

import ChatClient from "@/components/ChatClient"

describe("ChatClient", () => {
  it("renders the message input for Hindi and English typing", () => {
    const html = renderToStaticMarkup(React.createElement(ChatClient, { mode: "web" }))

    expect(html).toContain('dir="auto"')
    expect(html).toContain("लोन के बारे में पूछें")
  })
})
