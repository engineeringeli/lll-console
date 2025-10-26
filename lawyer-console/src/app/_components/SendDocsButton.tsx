'use client'

type Props = {
  _contactId: string; // underscore silences unused-var rule
};

/**
 * Opens the Documents bulk-add modal in the current thread.
 * No network calls here to avoid 400s from empty bulk payloads.
 */
export default function SendDocsButton({ contactId }: Props) {
  const onClick = () => {
    // Tell the DocumentsPanel in this page to open the bulk-add UI.
    window.dispatchEvent(new Event('open-bulk-add'))
  }

  return (
    <button
      className="border border-sky-600 bg-sky-900/40 hover:bg-sky-900/60 rounded px-3 py-1 text-sm"
      onClick={onClick}
      title="Open the bulk add documents panel"
    >
      Send Docs
    </button>
  )
}
