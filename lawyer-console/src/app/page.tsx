import Link from 'next/link'
import NewContactButton from '/Users/willtownsend/lawyer-followup/frontend/lawyer-console/src/app/_components/NewContactButton';
import SendDocsButton from '/Users/willtownsend/lawyer-followup/frontend/lawyer-console/src/app/_components/SendDocsButton';

export default function Home() {
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Lawyer Console</h1>
      <p className="opacity-70">Welcome. Use the links below.</p>
      <div className="space-x-4">
        <Link href="/inbox" className="underline">Go to Inbox</Link>
        <Link href="/settings" className="underline">Settings</Link>
      </div>
    </main>
  )
}
