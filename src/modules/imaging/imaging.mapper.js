// Pure builder: uploaded imaging files -> iapp_create_imaging_study params.
export function imagingStudyParams({ orderId, typeName, modality, eye, uploaded, report, notes, metadata }) {
  const files = uploaded || [];
  return {
    p_investigation_order_id: Number(orderId),
    p_study_type: typeName,
    p_cloudinary_public_id: files[0]?.public_id || null,
    p_cloudinary_url: files[0]?.src || null,
    p_report: String(report || '').trim() || null,
    p_eye: eye || null,
    p_modality: modality || null,
    p_metadata: metadata || {},
    p_files: files,
    p_notes: String(notes || '').trim() || null
  };
}
