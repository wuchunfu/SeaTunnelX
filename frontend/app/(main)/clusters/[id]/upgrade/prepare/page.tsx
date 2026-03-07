import {Suspense} from 'react';
import type {Metadata} from 'next';
import {ClusterUpgradePrepare} from '@/components/common/cluster/upgrade';

export const metadata: Metadata = {
  title: '集群升级准备',
};

interface ClusterUpgradePreparePageProps {
  params: Promise<{id: string}>;
}

export default async function ClusterUpgradePreparePage({params}: ClusterUpgradePreparePageProps) {
  const {id} = await params;
  const clusterId = parseInt(id, 10);

  return (
    <Suspense>
      <ClusterUpgradePrepare clusterId={clusterId} />
    </Suspense>
  );
}
