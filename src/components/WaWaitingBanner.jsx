// Red strip shown on every tab while WhatsApp chats wait for staff. Tap = open the WhatsApp tab.
import React from 'react';
import { C } from '../modules/theme/index.js';
import { waitingBannerText } from '../modules/whatsapp/model.js';

export default function WaWaitingBanner({ summary, onOpen }) {
  if (!summary || !summary.count) return null;
  return (
    <div role="alert" onClick={onOpen} style={{ background: C.danger + '22', border: '1px solid ' + C.danger, color: C.danger, borderRadius: 10, margin: '8px 12px', padding: '9px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>
      {'🔔 ' + waitingBannerText(summary)}
    </div>
  );
}
