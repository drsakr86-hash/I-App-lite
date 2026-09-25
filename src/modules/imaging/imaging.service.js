import { rpc } from '../../services/rpc.js';

export async function createImagingStudy(client, {
  investigationOrderId, studyType, cloudinaryPublicId = null, cloudinaryUrl = null,
  report = null, eye = null, modality = null, metadata = {}, files = [], notes = null
}) {
  return rpc(client, 'iapp_create_imaging_study', {
    p_investigation_order_id: Number(investigationOrderId),
    p_study_type: studyType,
    p_cloudinary_public_id: cloudinaryPublicId,
    p_cloudinary_url: cloudinaryUrl,
    p_report: report,
    p_eye: eye,
    p_modality: modality,
    p_metadata: metadata || {},
    p_files: files || [],
    p_notes: notes
  }, { timeoutMs: 20000, dedupe: true });
}
