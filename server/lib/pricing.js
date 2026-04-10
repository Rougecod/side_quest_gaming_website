const PRICING_CONFIG = {
  ps5: {
    offPeakKey: 'ps5_rate_morning',
    peakKey: 'ps5_rate_afternoon',
    offPeakFallback: 100,
    peakFallback: 150,
  },
  pool: {
    offPeakKey: 'pool_rate_morning',
    peakKey: 'pool_rate_afternoon',
    offPeakFallback: 150,
    peakFallback: 200,
  },
};

function getHourInIst(date) {
  return parseInt(new Date(date).toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hour12: false,
  }), 10);
}

function getPricingTier(startDate) {
  return getHourInIst(startDate) < 12 ? 'off_peak' : 'peak';
}

function getPricingConfig(settings = {}) {
  return {
    cutoff_hour: 12,
    ps5: {
      off_peak: parseInt(settings[PRICING_CONFIG.ps5.offPeakKey] || String(PRICING_CONFIG.ps5.offPeakFallback), 10),
      peak: parseInt(settings[PRICING_CONFIG.ps5.peakKey] || String(PRICING_CONFIG.ps5.peakFallback), 10),
    },
    pool: {
      off_peak: parseInt(settings[PRICING_CONFIG.pool.offPeakKey] || String(PRICING_CONFIG.pool.offPeakFallback), 10),
      peak: parseInt(settings[PRICING_CONFIG.pool.peakKey] || String(PRICING_CONFIG.pool.peakFallback), 10),
    },
  };
}

function resolveRateForService({ service, startDate, settings = {} }) {
  const pricing = getPricingConfig(settings);
  const tier = getPricingTier(startDate);
  return pricing[service]?.[tier] || 0;
}

module.exports = {
  getPricingConfig,
  getPricingTier,
  resolveRateForService,
};
