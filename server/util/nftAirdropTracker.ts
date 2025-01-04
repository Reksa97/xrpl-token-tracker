// deno-lint-ignore-file no-explicit-any
import xrpl from "xrpl";
import { bithompRequest } from "./bithomp.ts";
import { getLedgerIndexData } from "./xrpl.ts";

const nftCollections: Record<
  string,
  {
    issuer: string;
    airdropAddress: string;
    airdropCurrency: string;
    taxon: number;
    prefix: string;
  }
> = {
  parry: {
    issuer: "rnduQyj5e5KDrJjHrgJc8VkrnaNCJVB4LC",
    airdropAddress: "rPARRYa275XRBtPQ4wTxvHJuzYjNFS6ibR",
    airdropCurrency: "5041525259000000000000000000000000000000",
    taxon: 33,
    prefix: "parrypixel",
  },
};

export const processNFT = async (
  client: xrpl.Client,
  tokenNameArg = "parry"
) => {
  const apiToken = Deno.env.get("BITHOMP_API_KEY");
  if (!apiToken) {
    throw new Error("BITHOMP_API_KEY is requiredd");
  }
  console.log("Processing NFTs", tokenNameArg);
  const { prefix, airdropAddress, airdropCurrency, taxon, issuer } =
    nftCollections[tokenNameArg];
  const response = await bithompRequest(
    `https://xrplexplorer.com/api/v2/nfts?issuer=${issuer}&taxon=${taxon}&limit=100`,
    apiToken
  );
  const fullApiResponse = await response.json();
  const holdersMap: Record<
    string,
    {
      recentAirdrops?: number;
      address: string;
      nftAmount: number;
      rareNftAmount: number;
      normalNftAmount: number;
      nfts: any[];
    }
  > = {};
  const nfts = fullApiResponse["nfts"].map((nft: any) => {
    const nftAmount = holdersMap[nft.owner]
      ? holdersMap[nft.owner].nftAmount + 1
      : 1;
    const nftRecord = {
      name: nft.metadata.name,
      nftokenID: nft.nftokenID,
      isRare: nft.metadata.attributes.some(
        (attr: any) =>
          attr.trait_type === "6 Hand" && attr.value === "holding the bear"
      ),
      issuedAt: nft.issuedAt,
    };
    const rareNftAmount = holdersMap[nft.owner]
      ? holdersMap[nft.owner].nfts.filter((nft: any) =>
          nft.isRare ? true : false
        ).length + (nftRecord.isRare ? 1 : 0)
      : nftRecord.isRare
      ? 1
      : 0;
    holdersMap[nft.owner] = {
      address: nft.owner,
      nftAmount,
      rareNftAmount,
      normalNftAmount: nftAmount - rareNftAmount,
      nfts: holdersMap[nft.owner]
        ? [...holdersMap[nft.owner].nfts, nftRecord]
        : [nftRecord],
    };
    return {
      owner: nft.owner,
      name: nft.metadata.name,
      issuedAt: nft.issuedAt,
    };
  });

  let holders = Object.values(holdersMap);
  const totalHolders = holders.length;
  const totalNfts = nfts.length;

  const { index } = await getLedgerIndexData(client, "validated");

  let airdropStatus = await client.request({
    command: "account_tx",
    account: airdropAddress,
    limit: 30,
    ledger_index_min: index - 100000,
    ledger_index_max: index,
    forward: false, // false means return from most recent to oldest
  });

  const recentAirdrops: Record<
    string,
    { amount: number; transactions: any[] }
  > = {};

  let transactionsAmount = airdropStatus.result.transactions.length;

  airdropStatus.result.transactions.forEach((tx: any) => {
    if (
      tx.validated &&
      tx.meta?.delivered_amount?.currency === airdropCurrency
    ) {
      const txAmount = parseFloat(tx.meta.delivered_amount.value);
      const previousAmount =
        recentAirdrops[tx.tx_json.Destination]?.amount || 0;
      const newTransaction = {
        hash: tx.hash,
        close_time_iso: tx.close_time_iso,
        delivered_amount: tx.meta.delivered_amount,
      };
      const transactions =
        recentAirdrops[tx.tx_json.Destination]?.transactions || [];
      transactions.push(newTransaction);
      recentAirdrops[tx.tx_json.Destination] = {
        amount: previousAmount + txAmount,
        transactions,
      };
    }
  });

  while (airdropStatus.result.marker) {
    airdropStatus = await client.request({
      command: "account_tx",
      account: airdropAddress,
      limit: 30, // 40 seems to be the maximum per request
      marker: airdropStatus.result.marker,
      forward: false, // false means return from most recent to oldest
    });

    transactionsAmount += airdropStatus.result.transactions.length;

    airdropStatus.result.transactions.forEach((tx: any) => {
      if (
        tx.validated &&
        tx.meta?.delivered_amount?.currency === airdropCurrency
      ) {
        const txAmount = parseFloat(tx.meta.delivered_amount.value);
        const previousAmount =
          recentAirdrops[tx.tx_json.Destination]?.amount || 0;
        const newTransaction = {
          hash: tx.hash,
          close_time_iso: tx.close_time_iso,
          delivered_amount: tx.meta.delivered_amount,
        };
        const transactions =
          recentAirdrops[tx.tx_json.Destination]?.transactions || [];
        transactions.push(newTransaction);
        recentAirdrops[tx.tx_json.Destination] = {
          amount: previousAmount + txAmount,
          transactions,
        };
      }
    });
  }

  holders = holders.map((holder) => ({
    ...holder,
    recentAirdrops: recentAirdrops[holder.address]?.amount || null,
    recentAirdropsTransactions:
      recentAirdrops[holder.address]?.transactions.sort((a, b) =>
        a.close_time_iso.localeCompare(b.close_time_iso)
      ) || [],
  })) as any;

  holders = holders.sort(
    (a, b) => (a.recentAirdrops ?? 0) - (b.recentAirdrops ?? 0)
  );

  console.log(nfts);
  const encoder = new TextEncoder();
  const data = encoder.encode(
    JSON.stringify(
      {
        totalHolders,
        totalNfts,
        transactionsAmount: transactionsAmount,
        holders,
        recentAirdrops,
        airdropStatus,
        fullApiResponse,
      },
      null,
      2
    )
  );
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await Deno.writeFile(`nft_data/${prefix}-balances-${timestamp}.json`, data);
};
