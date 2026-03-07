import type {
  ConfigMergeFile,
  ConfigMergePlan,
  PrecheckResult,
  UpgradePlanRecord,
} from './types';

function sanitizeConfigMergeFile(file: ConfigMergeFile): ConfigMergeFile {
  const conflicts = Array.isArray(file.conflicts) ? file.conflicts : [];

  return {
    ...file,
    conflicts,
  };
}

export function sanitizeConfigMergePlan(plan?: ConfigMergePlan | null): ConfigMergePlan | null {
  if (!plan) {
    return null;
  }

  const files = Array.isArray(plan.files) ? plan.files.map(sanitizeConfigMergeFile) : [];

  return {
    ...plan,
    files,
  };
}

export function sanitizePrecheckResult(precheck?: PrecheckResult | null): PrecheckResult | null {
  if (!precheck) {
    return null;
  }

  return {
    ...precheck,
    issues: Array.isArray(precheck.issues) ? precheck.issues : [],
    node_targets: Array.isArray(precheck.node_targets) ? precheck.node_targets : [],
    config_merge_plan: sanitizeConfigMergePlan(precheck.config_merge_plan) || precheck.config_merge_plan,
  };
}

export function sanitizeUpgradePlanRecord(plan?: UpgradePlanRecord | null): UpgradePlanRecord | null {
  if (!plan) {
    return null;
  }

  return {
    ...plan,
    snapshot: {
      ...plan.snapshot,
      node_targets: Array.isArray(plan.snapshot.node_targets) ? plan.snapshot.node_targets : [],
      steps: Array.isArray(plan.snapshot.steps) ? plan.snapshot.steps : [],
      config_merge_plan: sanitizeConfigMergePlan(plan.snapshot.config_merge_plan) || plan.snapshot.config_merge_plan,
    },
  };
}
