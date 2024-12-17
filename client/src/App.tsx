// @deno-types="npm:@types/react"
import { useEffect, useState, useRef } from "react";
import { format } from "@std/datetime";
import { LineChart, Line, XAxis, YAxis, Tooltip, TooltipProps } from "recharts";
import { Holders } from "../../server/types.ts";
import { format as d3format } from "d3-format";

const getSupply = (token: string) => {
  switch (token) {
    case "ellis":
      return 58_900_000;
    case "parry":
      return 549_000_000;
    default:
      return 0;
  }
};

const calculateMedian = (values: number[]) => {
  const filteredValues = values.filter((value) => value > 0);
  if (filteredValues.length <= 1) return undefined;
  filteredValues.sort((a, b) => a - b);
  const mid = Math.floor(filteredValues.length / 2);
  return filteredValues.length % 2 !== 0
    ? filteredValues[mid]
    : (filteredValues[mid - 1] + filteredValues[mid]) / 2;
};

const calculateAverage = (values: number[]) => {
  const filteredValues = values.filter((value) => value > 0);
  if (filteredValues.length === 0) return undefined;
  const sum = filteredValues.reduce((a, b) => a + b, 0);
  return sum / filteredValues.length;
};

const getColorFromAddress = (address: string) => {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = (hash % 60) + 120; // Restrict hue to 120-180 range for green hues
  return `hsl(${hue}, 70%, 50%)`;
};

// deno-lint-ignore no-explicit-any
const CustomTooltip = ({ active, payload, label }: TooltipProps<any, any>) => {
  if (active && payload && payload.length) {
    const sortedPayload = payload
      .filter(
        (entry) => entry.dataKey !== "median" && entry.dataKey !== "average"
      )
      .sort((a, b) => Number(b.value) - Number(a.value))
      .slice(0, 10);

    const medianEntry = payload.find((entry) => entry.dataKey === "median");
    const averageEntry = payload.find((entry) => entry.dataKey === "average");

    return (
      <div
        className="custom-tooltip"
        style={{
          backgroundColor: "#333",
          color: "#fff",
          padding: "10px",
          borderRadius: "5px",
        }}
      >
        <p className="label">{`Time: ${format(
          new Date(label),
          "dd.MM.yyyy HH:mm:ss"
        )}`}</p>
        {medianEntry && (
          <p
            className="intro"
            style={{ color: medianEntry.color }}
          >{`Median: ${d3format(".2s")(Number(medianEntry.value)).replace(
            "G",
            "B"
          )}`}</p>
        )}
        {averageEntry && (
          <p
            className="intro"
            style={{ color: averageEntry.color }}
          >{`Average: ${d3format(".2s")(Number(averageEntry.value)).replace(
            "G",
            "B"
          )}`}</p>
        )}
        <h3>Biggest selected holders</h3>
        {sortedPayload.map((entry, index) => (
          <p key={`item-${index}`} style={{ color: entry.color }}>
            {`${index + 1}. ${entry.name}: ${d3format(".2s")(
              Number(entry.value)
            ).replace("G", "B")}`}
          </p>
        ))}
      </div>
    );
  }

  return null;
};

interface ChartDataItem {
  timestamp: string;
  median: number | undefined;
  average: number | undefined;
}

const App = () => {
  const [data, setData] = useState<Holders>();
  const [chartData, setChartData] = useState<ChartDataItem[]>();
  const [selectedAddresses, setSelectedAddresses] = useState<string[]>([]);
  const urlParams = new URLSearchParams(globalThis.location.search);
  const highlightedAddress = urlParams.get("highlight") ?? "";
  const selectedToken = urlParams.get("token") ?? "parry";
  const [showMedian, setShowMedian] = useState<boolean>(true);
  const [showAverage, setShowAverage] = useState<boolean>(true);

  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [filterByMax, setFilterByMax] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const debounceTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (highlightedAddress) {
      setSelectedAddresses((prev: string[]) => [
        ...new Set([...prev, highlightedAddress]),
      ]);
    }
  }, [highlightedAddress]);

  useEffect(() => {
    const selectedFile = `${selectedToken.toLowerCase()}-holders.json`;
    fetch(`/${selectedFile}`)
      .then((response) => response.json())
      .then((holders: Holders) => {
        setData(holders);
        const timestamps = holders.timestamps;
        const d: ChartDataItem[] = timestamps.map((timestamp) => {
          const values = Object.keys(holders.accounts).map(
            (address) => holders.accounts[address][timestamp]
          );
          return {
            timestamp,
            median: calculateMedian(values),
            average: calculateAverage(values),
            ...Object.fromEntries(
              Object.keys(holders.accounts).map((address) => [
                address,
                holders.accounts[address][timestamp],
              ])
            ),
          };
        });
        setChartData(d);

        const sortedAddresses = Object.keys(holders.accounts).sort((a, b) => {
          const diff = holders.accounts[b].now - holders.accounts[a].now;
          if (diff === 0) {
            return (
              holders.accounts[b].maxHoldings - holders.accounts[a].maxHoldings
            );
          }
          return diff;
        });
        setSelectedAddresses(sortedAddresses.slice(0, 10));
      })
      .catch((error) => {
        console.error("Error loading holders file:", error);
      });
  }, [selectedToken]);

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    const parsedMin =
      minAmount.trim() !== "" ? parseFloat(minAmount) : undefined;
    const parsedMax =
      maxAmount.trim() !== "" ? parseFloat(maxAmount) : undefined;

    if (minAmount.trim() !== "" && isNaN(Number(minAmount))) {
      setErrorMessage("Invalid minimum number");
      return;
    }

    if (maxAmount.trim() !== "" && isNaN(Number(maxAmount))) {
      setErrorMessage("Invalid maximum number");
      return;
    }

    if (
      parsedMin !== undefined &&
      parsedMax !== undefined &&
      parsedMin >= parsedMax
    ) {
      setErrorMessage("Minimum must be less than maximum");
      return;
    }

    setErrorMessage("");

    if (parsedMin === undefined && parsedMax === undefined) {
      return;
    }

    debounceTimer.current = setTimeout(() => {
      applyFilter(parsedMin, parsedMax);
    }, 589) as unknown as number;

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minAmount, maxAmount, filterByMax]);

  const applyFilter = (parsedMin?: number, parsedMax?: number) => {
    if (!data) return;

    // Filter addresses based on min/max conditions
    const filtered = Object.keys(data.accounts).filter((address) => {
      const value = filterByMax
        ? data.accounts[address].maxHoldings
        : data.accounts[address].now;

      // If min and max are set
      if (parsedMin !== undefined && parsedMax !== undefined) {
        return value > parsedMin && value < parsedMax;
      }

      // If only min is set
      if (parsedMin !== undefined && parsedMax === undefined) {
        return value > parsedMin;
      }

      // If only max is set
      if (parsedMax !== undefined && parsedMin === undefined) {
        return value < parsedMax;
      }

      // If neither is set, don't filter
      return true;
    });

    setSelectedAddresses(filtered);
  };

  const selectableTokens = [
    "ellis",
    "parry",
    // Add more tokens here as needed
  ];

  if (selectableTokens.indexOf(selectedToken) === -1) {
    return (
      <div style={{ padding: "20px" }}>
        <h1>Invalid token selected</h1>
        <p>
          The token you are trying to access is not available. Please select a
          valid token from the following list:
        </p>
        <ul>
          {selectableTokens.map((token) => (
            <li key={token}>
              <a href={`?token=${token}`}>{token.toUpperCase()}</a>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>{selectedToken.toUpperCase()} holders</h1>

      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "block", marginBottom: "5px" }}>
          <input
            type="checkbox"
            checked={showMedian}
            onChange={() => setShowMedian(!showMedian)}
            style={{ marginRight: "10px" }}
          />
          Show Median
        </label>
        <label style={{ display: "block", marginBottom: "5px" }}>
          <input
            type="checkbox"
            checked={showAverage}
            onChange={() => setShowAverage(!showAverage)}
            style={{ marginRight: "10px" }}
          />
          Show Average
        </label>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label>
          Minimum amount:
          <input
            type="text"
            value={minAmount}
            onChange={(e) => {
              setMinAmount(e.target.value);
            }}
            style={{
              marginLeft: "10px",
              marginRight: "20px",
              border:
                errorMessage.includes("Minimum") ||
                errorMessage.includes("Invalid")
                  ? "1px solid red"
                  : "1px solid #ccc",
            }}
          />
        </label>
        <label>
          Maximum amount:
          <input
            type="text"
            value={maxAmount}
            onChange={(e) => {
              setMaxAmount(e.target.value);
            }}
            style={{
              marginLeft: "10px",
              border:
                errorMessage.includes("maximum") ||
                errorMessage.includes("Invalid") ||
                errorMessage.includes("less than maximum")
                  ? "1px solid red"
                  : "1px solid #ccc",
            }}
          />
        </label>
        {errorMessage && (
          <span style={{ color: "red", marginLeft: "10px" }}>
            {errorMessage}
          </span>
        )}
      </div>
      <div style={{ marginBottom: "20px" }}>
        <label>
          <input
            type="checkbox"
            checked={filterByMax}
            onChange={() => setFilterByMax(!filterByMax)}
            style={{ marginRight: "10px" }}
          />
          Filter by maxHoldings (if not checked, filter by current holdings)
        </label>
        <p style={{ fontSize: "12px", color: "#555", marginTop: "5px" }}>
          If this box is checked, addresses are filtered using their maxHoldings
          values. Otherwise, their current holdings are used.
        </p>
      </div>

      {data && (
        <>
          <p>
            Selected Addresses: ({selectedAddresses.length} out of{" "}
            {chartData?.length})
          </p>
          <select
            multiple
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions).map(
                (option) => option.value
              );
              setSelectedAddresses(selected);
            }}
            style={{
              width: "600px",
              height: "300px",
              padding: "10px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              fontSize: "14px",
              overflowY: "scroll",
            }}
            value={selectedAddresses}
          >
            {Object.keys(data.accounts)
              .sort((a, b) => {
                const diff = data.accounts[b].now - data.accounts[a].now;
                if (diff === 0)
                  return (
                    data.accounts[b].maxHoldings - data.accounts[a].maxHoldings
                  );
                return diff;
              })
              .map((address, index) => {
                const { maxHoldings, now } = data.accounts[address];
                return (
                  <option key={address} value={address}>
                    {index + 1}: {address}{" "}
                    {`(${d3format(".2s")(now).replace("G", "B")}${
                      now !== maxHoldings
                        ? ", max " +
                          d3format(".2s")(maxHoldings).replace("G", "B")
                        : ""
                    }) ${((now * 100) / getSupply(selectedToken)).toFixed(1)}%`}
                  </option>
                );
              })}
          </select>
        </>
      )}

      {chartData && (
        <div
          style={{
            marginTop: "20px",
            display: "flex",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <LineChart width={1100} height={700} data={chartData}>
            <XAxis
              dataKey="timestamp"
              tickFormatter={(tick) => format(new Date(tick), "dd.MM.")}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={(tick) =>
                d3format(".2s")(Number(tick)).replace("G", "B")
              }
              /*  domain={[0, 65_000_000]} */
              allowDataOverflow
            />
            <Tooltip content={<CustomTooltip />} offset={40} />
            {showMedian && (
              <Line
                type="monotone"
                dataKey="median"
                stroke="cyan"
                dot={false}
              />
            )}
            {showAverage && (
              <Line
                type="monotone"
                dataKey="average"
                stroke="white"
                dot={false}
              />
            )}
            {selectedAddresses.length > 0 &&
              selectedAddresses.map((address: string) => (
                <Line
                  key={address}
                  type="monotone"
                  dataKey={address}
                  stroke={
                    address === highlightedAddress
                      ? "magenta"
                      : getColorFromAddress(address)
                  }
                  dot={false}
                />
              ))}
          </LineChart>
        </div>
      )}
    </div>
  );
};

export default App;
