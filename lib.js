'use strict';

function median(values) {
  const sorted = values.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}
function cleanQuery(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 100);
}
function simplifyItem(item) {
  const price = Number(item?.price?.value);
  if (!Number.isFinite(price) || price < 0) return null;
  const shipAmount = item?.shippingOptions?.[0]?.shippingCost?.value;
  const shipping = shipAmount === undefined ? null : Number(shipAmount);
  return {
    id: String(item.itemId || ''),
    title: String(item.title || 'Annonce eBay').slice(0, 220),
    price,
    currency: String(item?.price?.currency || 'EUR'),
    shipping: Number.isFinite(shipping) ? shipping : null,
    image: String(item?.image?.imageUrl || item?.thumbnailImages?.[0]?.imageUrl || ''),
    url: String(item.itemWebUrl || ''),
    condition: String(item.condition || ''),
    location: String(item?.itemLocation?.country || '')
  };
}
function computeProfit({ purchase = 0, sale = 0, postage = 0, feeRate = 0, fixedFee = 0, other = 0 }) {
  const nums = [purchase, sale, postage, feeRate, fixedFee, other].map(Number);
  if (nums.some(n => !Number.isFinite(n) || n < 0)) return null;
  const [p, s, shipping, rate, fixed, extra] = nums;
  const platformFees = s * (rate / 100) + fixed;
  const profit = s - p - shipping - platformFees - extra;
  return { profit, fees: platformFees, margin: s > 0 ? (profit / s) * 100 : null };
}
module.exports = { median, cleanQuery, simplifyItem, computeProfit };
