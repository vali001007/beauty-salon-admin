export function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function buildWeek(offsetWeeks = 0) {
  const today = new Date();
  const start = addDays(today, offsetWeeks * 7);
  const labels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return {
      label: labels[date.getDay()],
      date: formatDate(date),
      shortDate: `${date.getMonth() + 1}/${date.getDate()}`,
    };
  });
}
