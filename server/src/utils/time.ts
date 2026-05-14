const ET_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const getEasternDate = (now = new Date()): string => ET_FORMATTER.format(now);

export const nowIso = () => new Date().toISOString();
