// deno-lint-ignore-file no-explicit-any
import xrpl from "xrpl";
import { bithompRequest } from "./bithomp.ts";
import { getLedgerIndexTime } from "./xrpl.ts";

const nftCollections: Record<
  string,
  { issuer: string; taxon: number; prefix: string }
> = {
  parry: {
    issuer: "rnduQyj5e5KDrJjHrgJc8VkrnaNCJVB4LC",
    taxon: 33,
    prefix: "parrypixel",
  },
};
/* 
import { Client, LedgerDataRequest } from "xrpl";

// Define an interface to hold info about a single NFT in your collection
interface CollectionNFT {
  NFTokenID: string;
  Owner: string;
  Issuer: string;
  Taxon: number;
  Flags: number;
  TransferFee?: number;
}

// Replace these with your actual values
const ISSUER_ADDRESS = "rnduQyj5e5KDrJjHrgJc8VkrnaNCJVB4LC";
const TARGET_TAXON = 33;

async function fetchCollectionHolders(): Promise<CollectionNFT[]> {
  // Connect to an XRPL mainnet node (public cluster used as example)
  const client = new Client("wss://xrplcluster.com");
  await client.connect();

  let marker: string | undefined = undefined;
  const result: CollectionNFT[] = [];

  try {
    do {
      // 1) Build request
      const ledgerDataRequest: LedgerDataRequest = {
        command: "ledger_data",
        ledger_index: "validated",
        limit: 200, // can go up to 500
      };
      if (marker) {
        ledgerDataRequest.marker = marker;
      }

      // 2) Send request
      const response = await client.request(ledgerDataRequest);

      // 3) Iterate ledger objects
      for (const ledgerObject of response.result.state) {
        // We only care about NFTokenPage
        if (ledgerObject.LedgerEntryType === "NFTokenPage") {
          const { Owner, NFTokens } = ledgerObject as any;

          // 4) For each NFToken in the page, check if it matches our issuer + taxon
          if (Array.isArray(NFTokens)) {
            NFTokens.forEach((item: any) => {
              const nft = item.NFToken;
              if (
                nft.Issuer === ISSUER_ADDRESS &&
                nft.NFTokenTaxon === TARGET_TAXON
              ) {
                result.push({
                  NFTokenID: nft.NFTokenID,
                  Owner,
                  Issuer: nft.Issuer,
                  Taxon: nft.NFTokenTaxon,
                  Flags: nft.Flags,
                  TransferFee: nft.TransferFee,
                });
              }
            });
          }
        }
      }

      // 5) Keep track of the next marker
      marker = response.result.marker;
    } while (marker);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Close connection
    await client.disconnect();
  }

  return result;
} */

export const processNFT = async (
  // deno-lint-ignore no-unused-vars
  client: xrpl.Client,
  tokenNameArg = "parry"
) => {
  const apiToken = Deno.env.get("BITHOMP_API_KEY");
  if (!apiToken) {
    throw new Error("BITHOMP_API_KEY is requiredd");
  }
  console.log("Processing NFTs", tokenNameArg);
  const { prefix, taxon, issuer } = nftCollections[tokenNameArg];
  const response = await bithompRequest(
    `https://xrplexplorer.com/api/v2/nfts?issuer=${issuer}&taxon=${taxon}&limit=100`,
    apiToken
  );
  const fullApiResponse = await response.json();
  const holdersMap: Record<
    string,
    { address: string; nftAmount: number; nfts: string[] }
  > = {};
  const nfts = fullApiResponse["nfts"].map((nft: any) => {
    holdersMap[nft.owner] = {
      address: nft.owner,
      nftAmount: holdersMap[nft.owner]
        ? holdersMap[nft.owner].nftAmount + 1
        : 1,
      nfts: holdersMap[nft.owner]
        ? [...holdersMap[nft.owner].nfts, nft.metadata.name]
        : [nft.metadata.name],
    };
    return {
      owner: nft.owner,
      name: nft.metadata.name,
      issuedAt: nft.issuedAt,
    };
  });

  const holders = Object.values(holdersMap);
  holders.sort((a, b) => b.nftAmount - a.nftAmount);
  const totalHolders = holders.length;
  const totalNfts = nfts.length;

  console.log(nfts);
  const encoder = new TextEncoder();
  const data = encoder.encode(
    JSON.stringify(
      {
        totalHolders,
        totalNfts,
        holders,
        fullApiResponse,
      },
      null,
      2
    )
  );
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await Deno.writeFile(`nft_data/${prefix}-balances-${timestamp}.json`, data);
};
