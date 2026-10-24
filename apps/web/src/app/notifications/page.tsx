import { NotificationPrefs } from '@/components/NotificationPrefs';
import { NotificationsList } from '@/components/NotificationsList';

export default function Page() { return <main className="space-y-10 px-5 py-8"><NotificationsList /><NotificationPrefs /></main>; }
