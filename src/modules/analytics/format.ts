export function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

export function minutesAsHours(value: number) {
  return `${Math.round(value / 6) / 10} ч`;
}
