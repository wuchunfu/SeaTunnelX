import {Suspense} from 'react';
import type {Metadata} from 'next';
import {ClusterUpgradeConfig} from '@/components/common/cluster/upgrade';

export const metadata: Metadata = {
  title: '集群升级配置合并',
};

interface ClusterUpgradeConfigPageProps {
  params: Promise<{id: string}>;
}

export default async function ClusterUpgradeConfigPage({params}: ClusterUpgradeConfigPageProps) {
  const {id} = await params;
  const clusterId = parseInt(id, 10);

  return (
    <Suspense>
      <ClusterUpgradeConfig clusterId={clusterId} />
    </Suspense>
  );
}
