import { PDFParse } from "pdf-parse"
import * as cheerio from "cheerio"
import mammoth from "mammoth"

export type ParseResult = { text: string; name: string }

function getExtension(filename: string): string | undefined {
  return filename.split(".").pop()?.toLowerCase()
}

/**
 * Extracts plain text from uploaded file Buffer.
 * Supports: .txt, .md, .csv, .pdf, .docx
 */
export async function parseFile(buffer: Buffer, filename: string): Promise<ParseResult> {
  try {
    const ext = getExtension(filename)

    switch (ext) {
      case "txt":
      case "md":
      case "csv":
        return { text: buffer.toString("utf-8"), name: filename }
      case "pdf": {
        const parser = new PDFParse({ data: buffer })
        try {
          const data = await parser.getText()
          return { text: data.text, name: filename }
        } finally {
          await parser.destroy()
        }
      }
      case "docx": {
        const result = await mammoth.extractRawText({ buffer })
        return { text: result.value, name: filename }
      }
      default:
        throw new Error(`Unsupported file type: .${ext}. Supported: txt, md, csv, pdf, docx`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse file"
    throw new Error(message)
  }
}

/**
 * Fetches and extracts plain text from a URL.
 * Uses cheerio to strip HTML tags.
 */
export async function parseUrl(url: string): Promise<ParseResult> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "MyraAI-Bot/1.0" },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)
    $("script, style, nav, footer, header").remove()
    const text = $("body").text().replace(/\s+/g, " ").trim()

    return { text, name: new URL(url).hostname }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse URL"
    throw new Error(message)
  }
}
