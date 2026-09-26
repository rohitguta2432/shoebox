const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Indian digit grouping: ₹1,23,456.50
export function formatINR(value: number): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}₹${inr.format(Math.abs(value))}`;
}

export function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, "")}%`;
}
