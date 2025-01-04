export const bithompRequest = (url: string, apiToken: string) =>
  fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-bithomp-token": apiToken,
    },
  });
