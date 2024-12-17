export type Holders = {
  startTimestamp?: string;
  endTimestamp?: string;
  timestamps: string[];
  accounts: {
    [account: string]: { [timestamp: string]: number };
  };
};
