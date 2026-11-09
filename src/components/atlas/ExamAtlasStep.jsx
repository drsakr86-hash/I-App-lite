// The "anatomy sketch" step of the exam form: the atlas inline, with this patient and exam fixed.
import React from 'react';
import AtlasScreen from '../../screens/AtlasScreen.jsx';

export default function ExamAtlasStep({ patient, exam, session, drawings, onChange }) {
  const user = { id: session.id != null ? session.id : session.username, name: session.name || session.username || '' };
  return <AtlasScreen embedded role={session.role} user={user} context={{ patient, exam }} drawings={drawings} onDrawingsChange={onChange} />;
}
