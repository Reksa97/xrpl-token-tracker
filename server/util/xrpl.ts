import xrpl from "xrpl";
export const getLedgerIndexTime = async (
  client: xrpl.Client,
  ledgerIndex: number | "validated"
) => {
  const response = await client.request({
    command: "ledger",
    ledger_index: ledgerIndex,
  });
  console.log(response.result.ledger.close_time);
  const timeInISO = xrpl.rippleTimeToISOTime(response.result.ledger.close_time);
  return new Date(timeInISO);
};

export const getLedgerIndexData = async (
  client: xrpl.Client,
  ledgerIndex: number | "validated"
) => {
  const response = await client.request({
    command: "ledger",
    ledger_index: ledgerIndex,
  });
  console.log(response.result.ledger.close_time);
  const timeInISO = xrpl.rippleTimeToISOTime(response.result.ledger.close_time);
  return { index: response.result.ledger_index, date: new Date(timeInISO) };
};
