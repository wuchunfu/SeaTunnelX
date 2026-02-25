/**
 * Monitoring Center Page
 * 监控中心页面
 */

import {Suspense} from 'react';
import {Metadata} from 'next';
import {MonitoringCenterWorkspace} from '@/components/common/monitoring';

export const metadata: Metadata = {
  title: '监控中心',
};

export default function MonitoringPage() {
  return (
    <div className='w-full max-w-none px-3 sm:px-4 lg:px-6 xl:px-8 2xl:px-10 py-6'>
      <Suspense>
        <MonitoringCenterWorkspace />
      </Suspense>
    </div>
  );
}
