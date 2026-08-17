export async function run(ctx) {
  const res = await fetch('https://open.er-api.com/v6/latest/USD');
  const json = await res.json();
  return {
    usdCny: json.rates && json.rates.CNY,
    asOf: json.time_last_update_utc || '',
  };
}
