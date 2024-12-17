// deno-lint-ignore-file no-explicit-any
import xrpl from "xrpl";
import { Holders } from "./types.ts";

const getLedgerIndexTime = async (
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

const current = async (client: xrpl.Client) => {
  const account = Deno.env.get("XRPL_ACCOUNT");
  const token = Deno.env.get("ELLIS");
  if (!account || !token) {
    throw new Error(
      "XRPL_ACCOUNT and ELLIS environment variables are required"
    );
  }

  const response = await client.request({
    command: "account_lines",
    account: token,
    ledger_index: "validated",
    limit: 400,
  });

  const result = { ...response.result, timestamp: new Date().toISOString() };

  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(result, null, 2));
  await Deno.writeFile(`data/ellis-${new Date().getTime()}.json`, data);
};

const storeLedgerState = async (
  client: xrpl.Client,
  token: string,
  ledgerIndex: number | "validated"
) => {
  const response = await client.request({
    command: "account_lines",
    account: token,
    ledger_index: ledgerIndex,
    limit: 400,
  });

  const timeThen =
    ledgerIndex === "validated"
      ? new Date()
      : await getLedgerIndexTime(client, ledgerIndex);
  const result = { ...response.result, timestamp: timeThen.toISOString() };

  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(result, null, 2));
  console.log(
    `Writing ledger ${result.ledger_index} at ${timeThen.toISOString()}`
  );
  await Deno.writeFile(`data/ellis-${result.ledger_index}.json`, data);
};

const previous = async (client: xrpl.Client) => {
  const account = Deno.env.get("XRPL_ACCOUNT");
  const token = Deno.env.get("ELLIS");
  let startLedgerIndex = parseInt(Deno.args[1], 10);
  if (!account || !token) {
    throw new Error(
      "XRPL_ACCOUNT and ELLIS environment variables are required"
    );
  }

  if (!startLedgerIndex) {
    const ledgerResponse = await client.request({
      command: "ledger",
      ledger_index: "validated",
    });
    startLedgerIndex = ledgerResponse.result.ledger_index;
  }

  const ledgerStep = 1000;

  let ledgerIndex = startLedgerIndex;

  for (let i = 1; true; i++) {
    try {
      await storeLedgerState(client, token, ledgerIndex);
      // Step back in time
      ledgerIndex -= ledgerStep;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error fetching ledger ${ledgerIndex}:`, error);
      break;
    }
  }
};

const process = async () => {
  const files = [];
  const holders: Holders = { timestamps: [], accounts: {} };
  for (const dirEntry of Deno.readDirSync("data")) {
    if (dirEntry.isFile && dirEntry.name.endsWith(".json"))
      files.push(dirEntry.name);
  }
  files.sort();

  let i = 0;
  for (const file of files) {
    const fileData = await Deno.readTextFile(`data/${file}`);
    const json = JSON.parse(fileData);
    const timestamp = json.timestamp;
    holders.timestamps.push(timestamp);
    if (i === 0) {
      holders.startTimestamp = timestamp;
    }
    if (i === files.length - 1) {
      holders.endTimestamp = timestamp;
    }
    for (const line of json.lines) {
      const balance = parseFloat(line.balance) * -1;

      if (!holders.accounts[line.account]) {
        holders.accounts[line.account] = {};
      }

      holders.accounts[line.account].maxHoldings = Math.max(
        balance,
        holders.accounts[line.account].maxHoldings ?? 0
      );

      holders.accounts[line.account][timestamp] = balance;
      if (i === files.length - 1) {
        holders.accounts[line.account]["now"] = balance;
      }
    }
    i++;
  }

  for (const account in holders.accounts) {
    for (const timestamp of holders.timestamps) {
      if (!holders.accounts[account][timestamp]) {
        holders.accounts[account][timestamp] = 0;
      }
    }
    if (!holders.accounts[account]["now"]) {
      holders.accounts[account]["now"] = 0;
    }
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(holders, null, 2));
  await Deno.writeFile(`client/ellis-holders.json`, data);
  console.log(`Wrote client/ellis-holders.json`);
};

const processNewLedgers = async (client: xrpl.Client) => {
  const files = [];
  for (const dirEntry of Deno.readDirSync("data")) {
    if (dirEntry.isFile && dirEntry.name.endsWith(".json"))
      files.push(dirEntry.name);
  }
  files.sort();
  const newestFile = files[files.length - 1];
  let ledgerIndex = newestFile
    ? parseInt(newestFile.match(/ellis-(\d+)\.json/)![1], 10)
    : 0;

  console.log(`Starting from ledger ${ledgerIndex} + 1500`);

  while (true) {
    ledgerIndex += 1500;
    try {
      await storeLedgerState(client, Deno.env.get("ELLIS")!, ledgerIndex);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error: any) {
      if (error?.message?.includes("ledgerNotFound")) {
        console.log(
          "Reached the end of the ledger, fetching the latest one and quitting"
        );
        await storeLedgerState(client, Deno.env.get("ELLIS")!, "validated");
      } else {
        console.error(`Error processing ledger ${ledgerIndex}:`, error);
      }
      break;
    }
  }
};

if (import.meta.main) {
  const xrplUrl = Deno.env.get("XRPL") ?? "wss://s2.ripple.com/";
  console.log(`Connecting to ${xrplUrl}`);
  const client = new xrpl.Client(xrplUrl);
  await client.connect();

  const mode = Deno.args[0]; // deno run main.ts <mode>
  if (mode === "current") {
    await current(client);
  } else if (mode === "previous") {
    await previous(client);
  } else if (mode === "process") {
    await process();
  } else if (mode === "newest") {
    await processNewLedgers(client);
    await process();
  } else {
    throw new Error("Invalid mode");
  }

  client.disconnect();
}
