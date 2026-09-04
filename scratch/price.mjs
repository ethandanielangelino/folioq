const KEY = process.env.FINNHUB_API_KEY;
const ticker = "AAPL";

const res = await fetch(
  `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${KEY}`
);
const quote = await res.json();

console.log(ticker, "=", quote.c);
console.log("full response:", quote);