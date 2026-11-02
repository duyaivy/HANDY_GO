/**
 * Bayesian Average Rating smoothing utility.
 * Prevents small sample size distortions and protects cold-start workers from receiving a 0.0 quality score.
 *
 * Formula:
 * R_adj = (C * m + sum_ratings) / (C + n) = (C * m + (R_avg * n)) / (C + n)
 *
 * where:
 * - m = Platform prior mean rating (default 4.5)
 * - C = Confidence weight constant (default 5 ratings)
 * - n = Number of ratings the worker has received
 * - R_avg = Arithmetic mean rating of the worker
 *
 * Score normalization to [0, 100]:
 * Score = ((R_adj - 1.0) / 4.0) * 100
 */

export const DEFAULT_PRIOR_MEAN = 4.5;
export const DEFAULT_PRIOR_WEIGHT = 5.0;

export function calculateBayesianSmoothedRating(
  averageRating: number,
  ratingCount: number,
  priorMean = DEFAULT_PRIOR_MEAN,
  priorWeight = DEFAULT_PRIOR_WEIGHT,
): number {
  const count = Math.max(0, ratingCount || 0);
  const avg = Math.max(0, Math.min(5.0, averageRating || 0));

  if (count === 0) {
    return priorMean;
  }

  const smoothed = (priorWeight * priorMean + avg * count) / (priorWeight + count);
  return Math.round(smoothed * 1000) / 1000;
}

export function normalizeRatingScore(
  smoothedRating: number,
  minRating = 1.0,
  maxRating = 5.0,
): number {
  if (smoothedRating <= minRating) return 0.0;
  if (smoothedRating >= maxRating) return 100.0;

  const score = ((smoothedRating - minRating) / (maxRating - minRating)) * 100.0;
  return Math.round(score * 100) / 100;
}
