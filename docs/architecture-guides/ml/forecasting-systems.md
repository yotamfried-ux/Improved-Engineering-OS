# Forecasting Systems (Time Series)

## Description
Forecasting Systems predict future values of a time-ordered signal — demand, revenue, traffic, energy usage, sensor readings — by learning patterns from historical observations. The field spans classical statistical models (ARIMA, ETS), gradient-boosted tree models with hand-crafted time features, and modern deep learning architectures (Temporal Fusion Transformer, N-HiTS, PatchTST) that learn representations across many series simultaneously.

## When to Use
- Planning and inventory problems where future demand must be estimated to make decisions today
- Anomaly detection requiring a "normal" baseline to compare against (forecast then flag deviations)
- Capacity planning for infrastructure, staffing, or logistics where lead time is significant
- Financial and business reporting that requires forward-looking projections
- Any problem where the target variable has a meaningful temporal ordering and past values predict future values

## When NOT to Use
- The signal is fundamentally non-stationary and unpredictable (e.g., pure random walk with no structure)
- Ground truth future data is available at prediction time (use a regression model, not a forecast)
- The forecast horizon is longer than the amount of useful historical data available
- Causal inference is the goal rather than prediction — forecasting optimizes point estimates, not causal effects

## Advantages
- Classical models (ARIMA, ETS) are interpretable, fast to train, and well-understood statistically
- Global models (trained across many series) transfer patterns and outperform per-series models on short histories
- Modern deep learning models automatically learn seasonality, trends, and cross-series patterns
- Probabilistic forecasting provides prediction intervals, enabling risk-aware decisions
- Well-established evaluation protocol (time-series cross-validation, expanding window)

## Disadvantages
- Forecast accuracy degrades rapidly as the horizon extends, especially for volatile series
- Requires careful handling of non-stationarity, seasonality decomposition, and missing values
- Deep learning models need many series and long histories to outperform statistical baselines
- Point forecasts without uncertainty quantification can be dangerously misleading for decision-making
- Backtesting can be optimistic if data leakage from future data contaminates feature engineering

## Complexity
Medium to High — simple univariate statistical models are low complexity; building a scalable global forecasting pipeline for thousands of series with probabilistic outputs and automated retraining is high complexity.

## Scalability
Statistical models (per-series) scale trivially in parallel. Global deep learning models train once over all series and serve forecasts in batch. At very large scale (millions of series), use hierarchical reconciliation and distributed training. Ray or Dask can parallelize per-series fitting across CPUs.

## Key Components
- **Time series dataset** — historical observations with timestamps, series identifiers, and covariates (e.g., holidays, promotions, weather)
- **Preprocessing pipeline** — imputation of missing values, outlier handling, log/Box-Cox transforms, seasonality decomposition
- **Feature engineering** — lag features, rolling statistics, calendar features (day-of-week, month, quarter), fourier terms for seasonality
- **Forecasting model** — one of: ARIMA/SARIMA (statistical), Prophet (decomposable trend), LightGBM (tree-based with time features), or TFT/N-HiTS (deep learning global model)
- **Probabilistic calibration** — conformal prediction or quantile regression to produce prediction intervals
- **Backtesting harness** — expanding-window or sliding-window cross-validation that respects temporal ordering
- **Hierarchical reconciliation (optional)** — ensures forecasts at different aggregation levels (SKU → category → total) sum consistently (e.g., MinT, BU)
- **Serving pipeline** — generates forecasts on a schedule and writes them to a database or API for downstream consumers

## Reference Implementations
- [Nixtla/statsforecast](https://github.com/Nixtla/statsforecast) — fast, scalable statistical forecasting (ARIMA, ETS, Theta) in Python; excellent baseline and often competitive with deep learning
- [Nixtla/neuralforecast](https://github.com/Nixtla/neuralforecast) — deep learning models (N-HiTS, TFT, PatchTST) with the same API as statsforecast; easy to compare
- [facebook/prophet](https://github.com/facebook/prophet) — decomposable trend + seasonality model; great for business time series with holidays and changepoints
- [unit8co/darts](https://github.com/unit8co/darts) — Darts: 20+ time series forecasting models in Python

## Official Sources
- [Forecasting: Principles and Practice (Hyndman & Athanasopoulos)](https://otexts.com/fpp3/) — free online textbook; authoritative reference for statistical forecasting methods
- [Temporal Fusion Transformer (Lim et al., 2021)](https://arxiv.org/abs/1912.09363) — architecture paper for the TFT model; covers multi-horizon probabilistic forecasting
- [Nixtla documentation](https://nixtlaverse.nixtla.io/) — unified docs for statsforecast, neuralforecast, and mlforecast with benchmark comparisons
- [Darts Docs](https://unit8co.github.io/darts/) — time series forecasting library
- [Prophet Docs](https://facebook.github.io/prophet/docs/quick_start.html) — forecasting at scale

## Related Architectures
- See also: [Batch Training](./batch-training.md)
- See also: [Online Learning](./online-learning.md)
- See also: [Recommendation Systems](./recommendation-systems.md)
