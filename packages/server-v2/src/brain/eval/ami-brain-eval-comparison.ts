export type AmiBrainComparableEvalResult = {
  caseKey: string;
  deterministicPassed: boolean;
  failureCluster?: string | null;
};

export function compareAmiBrainEvalResults(input: {
  current: AmiBrainComparableEvalResult[];
  previous: AmiBrainComparableEvalResult[];
  comparable: boolean;
}) {
  if (!input.comparable) {
    return {
      comparable: false,
      unavailableReason: 'suite_identity_mismatch',
      newFailures: [],
      persistentFailures: [],
      recovered: [],
      missingPrevious: [],
    };
  }
  const previousByCase = new Map(input.previous.map((item) => [item.caseKey, item]));
  const newFailures: Array<{ caseKey: string; cluster: string | null; previousCluster: string | null }> = [];
  const persistentFailures: Array<{ caseKey: string; cluster: string | null; previousCluster: string | null }> = [];
  const recovered: Array<{ caseKey: string; previousCluster: string | null }> = [];
  const missingPrevious: string[] = [];

  for (const current of input.current) {
    const previous = previousByCase.get(current.caseKey);
    if (!previous) {
      missingPrevious.push(current.caseKey);
      continue;
    }
    if (!current.deterministicPassed && previous.deterministicPassed) {
      newFailures.push({
        caseKey: current.caseKey,
        cluster: current.failureCluster ?? null,
        previousCluster: previous.failureCluster ?? null,
      });
    } else if (!current.deterministicPassed && !previous.deterministicPassed) {
      persistentFailures.push({
        caseKey: current.caseKey,
        cluster: current.failureCluster ?? null,
        previousCluster: previous.failureCluster ?? null,
      });
    } else if (current.deterministicPassed && !previous.deterministicPassed) {
      recovered.push({ caseKey: current.caseKey, previousCluster: previous.failureCluster ?? null });
    }
  }

  return {
    comparable: true,
    unavailableReason: null,
    newFailures,
    persistentFailures,
    recovered,
    missingPrevious,
  };
}
