/**
 * يوم اليوم في الخرطوم (UTC+2) بصيغة ISO — اليومُ الذي تعدّه القاعدة في `ledger_today()`.
 * The server's own clock is UTC; between midnight and two in the morning in Khartoum it is still
 * yesterday there, and a report "up to today" would then stop a day short of what the ledger accepts.
 */
export const ledgerToday = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Khartoum", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
