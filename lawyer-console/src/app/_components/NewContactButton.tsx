"use client";

import { useState } from "react";
import NewContactModal from "./NewContactModal";

export default function NewContactButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-sky-600 bg-sky-900/40 hover:bg-sky-900/60 rounded px-3 py-1.5 text-sm text-slate-100 shadow-sm"
        title="Add a new contact"
      >
        + New Contact
      </button>

      {open && (
        <NewContactModal
          isOpen={open}
          onClose={() => setOpen(false)}
          onCreated={(contactId?: string) => {
            // Refresh the inbox list and optionally jump to the new thread
            if (contactId) {
              window.location.href = `/thread/${contactId}?open=bulk`;
            } else {
              window.location.reload();
            }
          }}
        />
      )}
    </>
  );
}