import {Suspense} from 'react';
import type {Metadata} from 'next';
import {ClusterUpgradeExecute} from '@/components/common/cluster/upgrade';

export const metadata: Metadata = {
  title: '集群升级执行',
};

interface ClusterUpgradeExecutePageProps {
  params: Promise<{id: string}>;
}

export default async function ClusterUpgradeExecutePage({params}: ClusterUpgradeExecutePageProps) {
  const {id} = await params;
  const clusterId = parseInt(id, 10);

  return (
    <Suspense>
      <ClusterUpgradeExecute clusterId={clusterId} />
    </Suspense>
  );
}
