import type { CompositeHealthScore } from '@/types';

export function calculateCompositeHealthScore(
  compliance: { passed: number; total: number } | null,
  security: { critical: number; warning: number; info: number } | null,
  quality: { maintainability_rating: string } | null,
  structural: { circular_deps: number } | null
): CompositeHealthScore {
  const ratingToPercent: Record<string, number> = {
    A: 100, B: 80, C: 60, D: 40, E: 20,
  };

  // Calculate raw percentages for available dimensions
  const dimensions: { key: string; pct: number; baseWeight: number }[] = [];

  if (compliance && compliance.total > 0) {
    dimensions.push({
      key: 'compliance',
      pct: compliance.passed / compliance.total,
      baseWeight: 0.40,
    });
  }

  if (security) {
    dimensions.push({
      key: 'security',
      pct: Math.max(0, 1 - (security.critical / 10)),
      baseWeight: 0.25,
    });
  }

  if (quality) {
    const qualityPct = (ratingToPercent[quality.maintainability_rating] ?? 50) / 100;
    dimensions.push({
      key: 'quality',
      pct: qualityPct,
      baseWeight: 0.20,
    });
  }

  if (structural) {
    dimensions.push({
      key: 'structural',
      pct: Math.max(0, 1 - (structural.circular_deps / 10)),
      baseWeight: 0.15,
    });
  }

  // Redistribute weights proportionally among available dimensions
  const totalBaseWeight = dimensions.reduce((sum, d) => sum + d.baseWeight, 0);

  let overall = 0;
  const dimMap = new Map(dimensions.map((d) => [d.key, d]));
  for (const dim of dimensions) {
    const adjustedWeight = totalBaseWeight > 0 ? dim.baseWeight / totalBaseWeight : 0;
    overall += adjustedWeight * dim.pct;
  }
  overall = Math.round(overall * 100);

  return {
    overall,
    compliance: {
      score: Math.round((dimMap.get('compliance')?.pct ?? 1) * 100),
      weight: 0.40,
      passed: compliance?.passed ?? 0,
      total: compliance?.total ?? 0,
    },
    security: {
      score: Math.round((dimMap.get('security')?.pct ?? 1) * 100),
      weight: 0.25,
      critical: security?.critical ?? 0,
      warning: security?.warning ?? 0,
      info: security?.info ?? 0,
    },
    quality: {
      score: Math.round((dimMap.get('quality')?.pct ?? 1) * 100),
      weight: 0.20,
      rating: quality?.maintainability_rating ?? 'N/A',
    },
    structural: {
      score: Math.round((dimMap.get('structural')?.pct ?? 1) * 100),
      weight: 0.15,
      circular_deps: structural?.circular_deps ?? 0,
    },
  };
}
