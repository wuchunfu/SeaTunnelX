/**
 * SeaTunnel version metadata helpers
 * SeaTunnel 版本元数据辅助方法
 */

import type { AvailableVersions } from '@/lib/services/installer/types';

export const DEFAULT_SEATUNNEL_INSTALL_DIR_TEMPLATE = '/opt/seatunnel-{version}';

export function resolveSeatunnelVersion(metadata?: Pick<AvailableVersions, 'recommended_version' | 'versions'> | null): string {
  return metadata?.recommended_version || metadata?.versions?.[0] || '';
}

export function buildSeatunnelInstallDir(version?: string): string {
  return version ? `/opt/seatunnel-${version}` : DEFAULT_SEATUNNEL_INSTALL_DIR_TEMPLATE;
}
