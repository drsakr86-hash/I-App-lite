// Original icon for the clinic's WhatsApp inbox: a chat bubble with an eye inside (drawn here; not a copy of any third-party logo).
import React from 'react';

export default function ClinicChatIcon({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" />
      <path d="M7.6 9.5c1.1-1.6 2.7-2.4 4.4-2.4s3.3.8 4.4 2.4c-1.1 1.6-2.7 2.4-4.4 2.4S8.7 11.1 7.6 9.5z" />
      <circle cx="12" cy="9.5" r="1.1" fill={color} stroke="none" />
    </svg>
  );
}
