// Generic JSON shape
export type JsonValue =
  | string | number | boolean | null
  | { [k: string]: JsonValue }
  | JsonValue[];

export type ApiError = { detail?: string };

// Your domain models (extend as needed)
export type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};

export type ThreadMessage = {
  id: string;
  channel: "EMAIL" | "SMS";
  direction: "DRAFT" | "OUTBOUND" | "INBOUND";
  body: string;
  created_at: string; // ISO
  meta?: JsonValue;
};

export type OrgSettings = {
  org_name?: string;
  reply_email?: string | null;
  reply_phone?: string | null;
  timezone?: string;
  // add whatever your backend returns
};
