import { useEffect, useState } from "react";
import { format } from "@std/datetime";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  TooltipProps,
} from "recharts";
import { Holders } from "../../server/types.ts";
import { format as d3format } from "d3-format";

const calculateMedian = (values: number[]) => {
  const filteredValues = values.filter((value) => value > 0);
  if (filteredValues.length === 0 || filteredValues.length === 1)
    return undefined;
  filteredValues.sort((a, b) => a - b);
  const mid = Math.floor(filteredValues.length / 2);
  return filteredValues.length % 2 !== 0
    ? filteredValues[mid]
    : (filteredValues[mid - 1] + filteredValues[mid]) / 2;
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
      .filter((entry) => entry.dataKey !== "median")
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    const medianEntry = payload.find((entry) => entry.dataKey === "median");

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
          <p className="intro">{`Median: ${d3format(".2s")(
            medianEntry.value
          ).replace("G", "B")}`}</p>
        )}
        {sortedPayload.map((entry, index) => (
          <p key={`item-${index}`} style={{ color: entry.color }}>
            {`${entry.name}: ${d3format(".2s")(entry.value).replace("G", "B")}`}
          </p>
        ))}
      </div>
    );
  }

  return null;
};

const App = () => {
  const [data, setData] = useState<Holders | undefined>();
  const [chartData, setChartData] = useState();
  const [selectedAddresses, setSelectedAddresses] = useState<string[]>([]);
  useEffect(() => {
    fetch("/ellis-holders.json")
      .then((response) => response.json())
      .then((holders: Holders) => {
        setData(holders);
        const timestamps = holders.timestamps;
        const d = timestamps.map((timestamp) => {
          const values = Object.keys(holders.accounts).map(
            (address) => holders.accounts[address][timestamp]
          );
          return {
            timestamp,
            median: calculateMedian(values),
            ...Object.fromEntries(
              Object.keys(holders.accounts).map((address) => [
                address,
                holders.accounts[address][timestamp],
              ])
            ),
          };
        });
        setChartData(d);
        console.log("chartData", d);
      });
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>$ELLIS holders over time</h1>
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
      >
        {data &&
          Object.keys(data.accounts)
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
                  }) ${((now * 100) / 58_900_000).toFixed(1)}%`}
                </option>
              );
            })}
      </select>
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
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(tick) => format(new Date(tick), "dd.MM. HH:mm")}
            />
            <YAxis
              tickFormatter={(tick) => d3format(".2s")(tick).replace("G", "B")}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="median" stroke="cyan" dot={false} />
            {selectedAddresses.length > 0 &&
              selectedAddresses.map((address: string) => (
                <Line
                  key={address}
                  type="monotone"
                  dataKey={address}
                  stroke={
                    address === "rW7WjoXrEkCAkX6HMYogQA1nyd2BSwUqT"
                      ? "#ff00ff"
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
