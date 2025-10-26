// lawyer-console/src/types.ts
export interface NewContactForm {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}

export interface Message {
  id: string;
  contactId: string;
  direction: "inbound" | "outbound";
  channel: "sms" | "email";
  body: string;
  createdAt: string; // ISO
  read?: boolean;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  status?: "new" | "active" | "closed";
}
