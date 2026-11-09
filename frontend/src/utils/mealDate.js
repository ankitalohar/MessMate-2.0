const TIME_ZONE = "Asia/Kolkata";
const SUBMISSION_CUTOFF_HOUR = 22;

export function getDefaultMealDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const daysAhead = Number(values.hour) >= SUBMISSION_CUTOFF_HOUR ? 2 : 1;
  const today = new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day) + daysAhead
  ));

  return [
    today.getUTCFullYear(),
    String(today.getUTCMonth() + 1).padStart(2, "0"),
    String(today.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
