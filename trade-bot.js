const Binance = require('node-binance-api');
const technicalindicators = require('technicalindicators');

const binance = new Binance().options({
  APIKEY: 'YOUR_API_KEY',
  APISECRET: 'YOUR_API_SECRET'
});

const symbol = 'XRPUSDT';
const interval = '5m';
const SL_PERCENT = 0.5;  // Stop Loss
const TP_PERCENT = 0.1; // Take Profit

// Lấy số lượng giao dịch theo 50% vốn
async function getQuantityByBalance(price) {
  try {
    const account = await binance.futuresAccount();
    const balance = parseFloat(account.totalWalletBalance); // Futures balance
    const tradeValue = balance * 0.5;
    const quantity = (tradeValue / price).toFixed(1);
    return quantity;
  } catch (err) {
    console.error("❌ Lỗi khi lấy số dư:", err.message);
    return 0;
  }
}

// Đặt lệnh LONG hoặc SHORT
async function placeOrder(direction, price) {
  const quantity = await getQuantityByBalance(price);
  if (quantity <= 0) return console.log("Không đủ số dư để vào lệnh");

  const stopLoss = (direction === 'LONG') 
    ? (price * (1 - SL_PERCENT / 100)).toFixed(4)
    : (price * (1 + SL_PERCENT / 100)).toFixed(4);

  const takeProfit = (direction === 'LONG')
    ? (price * (1 + TP_PERCENT / 100)).toFixed(4)
    : (price * (1 - TP_PERCENT / 100)).toFixed(4);

  console.log(`🚀 Vào lệnh ${direction} tại ${price} | SL: ${stopLoss} | TP: ${takeProfit} | Số lượng: ${quantity}`);

  try {
    if (direction === 'LONG') {
      await binance.futuresMarketBuy(symbol, quantity);
      await binance.futuresOrder('SELL', symbol, quantity, takeProfit, {
        reduceOnly: true, type: 'LIMIT', timeInForce: 'GTC'
      });
      await binance.futuresOrder('SELL', symbol, quantity, null, {
        stopPrice: stopLoss, reduceOnly: true, type: 'STOP_MARKET'
      });
    } else {
      await binance.futuresMarketSell(symbol, quantity);
      await binance.futuresOrder('BUY', symbol, quantity, takeProfit, {
        reduceOnly: true, type: 'LIMIT', timeInForce: 'GTC'
      });
      await binance.futuresOrder('BUY', symbol, quantity, null, {
        stopPrice: stopLoss, reduceOnly: true, type: 'STOP_MARKET'
      });
    }
  } catch (err) {
    console.error("❌ Lỗi khi đặt lệnh:", err.message);
  }
}

// Phân tích kỹ thuật & quyết định vào lệnh
async function checkSignal() {
  try {
    const candles = await binance.futuresCandles(symbol, interval, { limit: 100 });
    const closes = candles.map(c => parseFloat(c.close));
    const highs = candles.map(c => parseFloat(c.high));
    const lows = candles.map(c => parseFloat(c.low));

    const ema50 = technicalindicators.EMA.calculate({ period: 50, values: closes });
    const ema200 = technicalindicators.EMA.calculate({ period: 200, values: closes });

    const stoch = technicalindicators.Stochastic.calculate({
      high: highs, low: lows, close: closes, period: 14, signalPeriod: 3
    });

    const macd = technicalindicators.MACD.calculate({
      values: closes,
      fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
      SimpleMAOscillator: false, SimpleMASignal: false
    });

    const lastClose = closes[closes.length - 1];
    const lastEMA50 = ema50[ema50.length - 1];
    const lastEMA200 = ema200[ema200.length - 1];
    const lastStoch = stoch[stoch.length - 1];
    const lastMACD = macd[macd.length - 1];

    const longSignal = lastEMA50 > lastEMA200 &&
                       lastStoch.k < 20 && lastStoch.k > lastStoch.d &&
                       lastMACD.MACD > lastMACD.signal;

    const shortSignal = lastEMA50 < lastEMA200 &&
                        lastStoch.k > 80 && lastStoch.k < lastStoch.d &&
                        lastMACD.MACD < lastMACD.signal;

    if (longSignal) {
      await placeOrder('LONG', lastClose);
    } else if (shortSignal) {
      await placeOrder('SHORT', lastClose);
    } else {
      console.log("⏳ Không có tín hiệu hợp lệ");
    }
  } catch (err) {
    console.error("❌ Lỗi phân tích tín hiệu:", err.message);
  }
}

// Kiểm tra tín hiệu mỗi 3 phút
setInterval(checkSignal, 3 * 60 * 1000);
