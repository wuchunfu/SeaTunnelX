import {redirect} from 'next/navigation';

export default function MonitoringHistoryRedirectPage() {
  redirect('/monitoring?tab=history');
}
