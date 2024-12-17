// deno-lint-ignore-file no-explicit-any
import xrpl from "xrpl";
import { Holders } from "./types.ts";

const ledgerStep = 1500;

const tokens = {
  ellis: {
    address: "rUJtSLHAhacEmcDZ92t4gdD7SUhbJB9bYC",
    prefix: "ellis",
  },
  parry: {
    address: "raFfm8ihTX65ToJCdBE55dg5WvfgJXCHnk",
    prefix: "parry",
  },
};

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

const current = async (client: xrpl.Client, tokenName: keyof typeof tokens) => {
  const token = tokens[tokenName].address;
  if (!token) {
    throw new Error(`Token address is required`);
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
  await Deno.writeFile(
    `data/${tokens[tokenName].prefix}-${new Date().getTime()}.json`,
    data
  );
};

const storeLedgerState = async (
  client: xrpl.Client,
  tokenName: keyof typeof tokens,
  ledgerIndex: number | "validated"
) => {
  const token = tokens[tokenName].address;
  if (!token) {
    throw new Error(
      `${tokens[tokenName].address} environment variable is required`
    );
  }

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
  await Deno.writeFile(
    `data/${tokens[tokenName].prefix}-${result.ledger_index}.json`,
    data
  );
};

const previous = async (
  client: xrpl.Client,
  tokenName: keyof typeof tokens
) => {
  const token = tokens[tokenName].address;
  let startLedgerIndex = Deno.args[2] ? parseInt(Deno.args[2], 10) : undefined;
  if (!token) {
    throw new Error(`Token address is required`);
  }

  if (!startLedgerIndex) {
    const files = getSortedFiles(tokenName);
    const oldestFile = files[0];
    startLedgerIndex = oldestFile
      ? parseInt(
          oldestFile.match(new RegExp(`${tokenName}-(\\d+)\\.json`))![1],
          10
        )
      : undefined;
    if (!startLedgerIndex) {
      console.log("No previous files found, starting from the latest ledger");
      const ledgerResponse = await client.request({
        command: "ledger",
        ledger_index: "validated",
      });
      startLedgerIndex = ledgerResponse.result.ledger_index;
    }
  }

  let ledgerIndex = startLedgerIndex;

  console.log(`Starting from ledger ${ledgerIndex}`);

  for (let i = 1; true; i++) {
    try {
      await storeLedgerState(client, tokenName, ledgerIndex);
      // Step back in time
      ledgerIndex -= ledgerStep;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error fetching ledger ${ledgerIndex}:`, error);
      break;
    }
  }
};

const process = async (tokenName: keyof typeof tokens) => {
  const files = [];
  const prefix = tokens[tokenName].prefix;

  for (const dirEntry of Deno.readDirSync("data")) {
    if (
      dirEntry.isFile &&
      dirEntry.name.endsWith(".json") &&
      dirEntry.name.startsWith(prefix)
    ) {
      files.push(dirEntry.name);
    }
  }
  files.sort();

  const holders: Holders = { timestamps: [], accounts: {} };

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
  await Deno.writeFile(`client/public/${prefix}-holders.json`, data);
  console.log(`Wrote client/public/${prefix}-holders.json`);
};

const getSortedFiles = (tokenName: keyof typeof tokens) => {
  const files = [];
  const prefix = tokens[tokenName].prefix;

  for (const dirEntry of Deno.readDirSync("data")) {
    if (
      dirEntry.isFile &&
      dirEntry.name.endsWith(".json") &&
      dirEntry.name.startsWith(prefix)
    ) {
      files.push(dirEntry.name);
    }
  }
  files.sort();
  return files;
};

const processNewLedgers = async (
  client: xrpl.Client,
  tokenName: keyof typeof tokens
) => {
  const prefix = tokens[tokenName].prefix;
  const files = getSortedFiles(tokenName);
  const newestFile = files[files.length - 1];
  let ledgerIndex = newestFile
    ? parseInt(newestFile.match(new RegExp(`${prefix}-(\\d+)\\.json`))![1], 10)
    : 0;

  console.log(`Starting from ledger ${ledgerIndex} + ${ledgerStep}`);

  while (true) {
    ledgerIndex += ledgerStep;
    try {
      await storeLedgerState(client, tokenName, ledgerIndex);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error: any) {
      if (error?.message?.includes("ledgerNotFound")) {
        console.log(
          "Reached the end of the ledger, fetching the latest one and quitting"
        );
        await storeLedgerState(client, tokenName, "validated");
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

  const mode = Deno.args[0]; // deno run main.ts <mode> <token>
  const tokenNameArg = (
    Deno.args[1] ?? "ellis"
  ).toLowerCase() as keyof typeof tokens;

  if (!tokens[tokenNameArg]) {
    throw new Error(
      `Invalid token name. Supported tokens: ${Object.keys(tokens).join(", ")}`
    );
  }

  console.log(`Running in ${mode} mode for ${tokenNameArg}`);

  if (mode === "current") {
    await current(client, tokenNameArg);
  } else if (mode === "previous") {
    await previous(client, tokenNameArg);
    await process(tokenNameArg);
  } else if (mode === "process") {
    await process(tokenNameArg);
  } else if (mode === "newest") {
    await processNewLedgers(client, tokenNameArg);
    await process(tokenNameArg);
  } else {
    throw new Error("Invalid mode");
  }

  client.disconnect();
}
