type LogLevel = "info" | "warn" | "error"

type LogFields = Record<string, unknown>

function writeStructuredLog(level: LogLevel, event: string, fields: LogFields = {}) {
  const entry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  }
  const serialized = JSON.stringify(entry)

  if (level === "error") {
    console.error(serialized)
    return
  }
  if (level === "warn") {
    console.warn(serialized)
    return
  }
  console.log(serialized)
}

export const logger = {
  info: (event: string, fields?: LogFields) => writeStructuredLog("info", event, fields),
  warn: (event: string, fields?: LogFields) => writeStructuredLog("warn", event, fields),
  error: (event: string, fields?: LogFields) => writeStructuredLog("error", event, fields),
}
