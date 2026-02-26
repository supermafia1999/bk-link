const { Decimal } = require('decimal.js');

// Format currency with proper decimals
const formatCurrency = (amount, currency = 'USD') => {
  const decimals = currency === 'BTC' || currency === 'ETH' ? 8 : 2;
  return new Decimal(amount).toFixed(decimals);
};

// Format percentage
const formatPercentage = (value, decimals = 2) => {
  return `${(value >= 0 ? '+' : '')}${new Decimal(value).toFixed(decimals)}%`;
};

// Calculate interest
const calculateInterest = (principal, rate, timeMonths) => {
  const p = new Decimal(principal);
  const r = new Decimal(rate).dividedBy(100).dividedBy(12); // Monthly rate
  const t = new Decimal(timeMonths);
  
  // Simple interest: P * r * t
  return p.times(r).times(t);
};

// Calculate compound interest
const calculateCompoundInterest = (principal, rate, timeMonths, compoundsPerYear = 12) => {
  const p = new Decimal(principal);
  const r = new Decimal(rate).dividedBy(100);
  const n = new Decimal(compoundsPerYear);
  const t = new Decimal(timeMonths).dividedBy(12);
  
  // A = P(1 + r/n)^(nt)
  const amount = p.times(
    new Decimal(1).plus(r.dividedBy(n)).pow(n.times(t))
  );
  
  return amount.minus(p);
};

// Calculate loan payment (amortization)
const calculateLoanPayment = (principal, annualRate, termMonths) => {
  const p = new Decimal(principal);
  const r = new Decimal(annualRate).dividedBy(100).dividedBy(12); // Monthly rate
  const n = new Decimal(termMonths);
  
  if (r.isZero()) {
    return p.dividedBy(n);
  }
  
  // M = P[r(1+r)^n]/[(1+r)^n-1]
  const factor = new Decimal(1).plus(r).pow(n);
  const payment = p.times(r.times(factor)).dividedBy(factor.minus(1));
  
  return payment;
};

// Generate pagination metadata
const getPaginationMeta = (page, limit, total) => {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 10;
  const totalPages = Math.ceil(total / limitNum);
  
  return {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages,
    hasNextPage: pageNum < totalPages,
    hasPrevPage: pageNum > 1,
  };
};

// Sanitize user input
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input
    .trim()
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');
};

// Parse date range
const parseDateRange = (startDate, endDate) => {
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();
  
  // Set to start/end of day
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
};

// Format date for display
const formatDate = (date, format = 'short') => {
  const d = new Date(date);
  
  switch (format) {
    case 'short':
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    case 'long':
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    case 'datetime':
      return d.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    case 'time':
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    default:
      return d.toISOString();
  }
};

// Deep clone object
const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

// Sleep/delay helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Retry function with exponential backoff
const retry = async (fn, maxAttempts = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await sleep(delay * Math.pow(2, attempt - 1));
    }
  }
};

module.exports = {
  formatCurrency,
  formatPercentage,
  calculateInterest,
  calculateCompoundInterest,
  calculateLoanPayment,
  getPaginationMeta,
  sanitizeInput,
  parseDateRange,
  formatDate,
  deepClone,
  sleep,
  retry,
};
