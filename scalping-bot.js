require('dotenv').config();
const Binance = require('node-binance-api');
const { EMA, BollingerBands, RSI } = require('technicalindicators');

const binance = new Binance().options({
  APIKEY: process.env.BINANCE_API_KEY,
  APISECRET: process.env.BINANCE_API_SECRET,
  useServerTime: true,
  
});
console.log("🔐 API KEY:", process.env.BINANCE_API_KEY);
console.log("🔐 API SECRET:", process.env.BINANCE_API_SECRET);

async function testAPIConnection() {
  try {
    const accountInfo = await binance.futuresAccount();
    console.log("✅ Đã kết nối API thành công!");
    console.log(`💰 Số dư USDT: ${accountInfo.totalWalletBalance}`);
  } catch (error) {
    console.error("❌ Lỗi kết nối API:", error.body || error.message);
  }
}

// Gọi test kết nối API
testAPIConnection();


const SYMBOL = 'DOGEUSDT';
const INTERVAL = '3m';
const QUANTITY = 20; // Tùy chỉnh
const TP_PERCENT = 1.5; // Take Profit 1.5%
const SL_PERCENT = 0.8; // Stop Loss 0.8%

async function getKlines() {
  const candles = await binance.candlesticks(SYMBOL, INTERVAL, { limit: 50 });
  return candles.map(c => ({
    time: c[0],
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5])
  }));
  
}

async function analyzeAndTrade() {
  
  console.log(`[${new Date().toLocaleTimeString()}] 🔍 Đang phân tích thị trường...`);
  const data = await getKlines();
  const closes = data.map(c => c.close);

  const ema9 = EMA.calculate({ period: 9, values: closes });
  const ema21 = EMA.calculate({ period: 21, values: closes });
  const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const rsi = RSI.calculate({ period: 14, values: closes });

  const lastClose = closes[closes.length - 1];
  const ema9Last = ema9[ema9.length - 1];
  const ema21Last = ema21[ema21.length - 1];
  const bbLast = bb[bb.length - 1];
  const rsiLast = rsi[rsi.length - 1];

  console.log(`Close: ${lastClose} | EMA9: ${ema9Last} | EMA21: ${ema21Last} | RSI: ${rsiLast}`);

  // LONG
  if (ema9Last > ema21Last && lastClose < bbLast.lower && rsiLast < 40) {
    console.log('Signal: LONG');
    await openPosition('BUY', lastClose);
  }

  // SHORT
  if (ema9Last < ema21Last && lastClose > bbLast.upper && rsiLast > 60) {
    console.log('Signal: SHORT');
    await openPosition('SELL', lastClose);
  }
  console.log('==========================');
  console.log(`⏰ Time: ${new Date().toLocaleString()}`);
  console.log(`📊 Close: ${lastClose.toFixed(2)}, EMA9: ${ema9Last.toFixed(2)}, EMA21: ${ema21Last.toFixed(2)}`);
  console.log(`📉 Bollinger Low: ${bbLast.lower.toFixed(2)}, High: ${bbLast.upper.toFixed(2)}`);
  console.log(`💡 RSI: ${rsiLast.toFixed(2)}`);
  console.log('==========================');

}

async function openPosition(side, entryPrice) {
  try {
    const isLong = side === 'BUY';
    const stopLossPrice = isLong
      ? entryPrice * (1 - SL_PERCENT / 100)
      : entryPrice * (1 + SL_PERCENT / 100);
    const takeProfitPrice = isLong
      ? entryPrice * (1 + TP_PERCENT / 100)
      : entryPrice * (1 - TP_PERCENT / 100);

    // Đặt lệnh Market vào lệnh trước
    const order = isLong
      ? await binance.futuresMarketBuy(SYMBOL, QUANTITY)
      : await binance.futuresMarketSell(SYMBOL, QUANTITY);

    console.log(`${side} Market Order Executed`, order);

    // Đặt lệnh TP
    await binance.futuresOrder(
      isLong ? 'SELL' : 'BUY',
      SYMBOL,
      QUANTITY,
      takeProfitPrice.toFixed(2),
      {
        reduceOnly: true,
        type: 'TAKE_PROFIT_MARKET',
        stopPrice: takeProfitPrice.toFixed(2),
        timeInForce: 'GTC'
      }
    );

    // Đặt lệnh SL
    await binance.futuresOrder(
      isLong ? 'SELL' : 'BUY',
      SYMBOL,
      QUANTITY,
      stopLossPrice.toFixed(2),
      {
        reduceOnly: true,
        type: 'STOP_MARKET',
        stopPrice: stopLossPrice.toFixed(2),
        timeInForce: 'GTC'
      }
    );

    console.log(`TP at: ${takeProfitPrice.toFixed(2)}, SL at: ${stopLossPrice.toFixed(2)}`);
  } catch (err) {
    console.error('Order error:', err.body || err.message);
  }
  console.log(`\n🚀 Open ${side} Position at ${entryPrice.toFixed(2)}`);
  console.log(`🎯 TP Price: ${takeProfitPrice.toFixed(2)} | 🛑 SL Price: ${stopLossPrice.toFixed(2)}\n`);

  console.log('📤 Sending market order...');
  console.log(`✅ Market ${side} executed.`);

  console.log('📤 Setting TAKE PROFIT and STOP LOSS...');
  console.log(`✅ TP set at ${takeProfitPrice.toFixed(2)} | ✅ SL set at ${stopLossPrice.toFixed(2)}\n`);

}

// Chạy lặp mỗi 3 phút
setInterval(analyzeAndTrade, 3 * 60 * 1000);
