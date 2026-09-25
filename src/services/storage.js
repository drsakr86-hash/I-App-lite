// Phase 66-70: storage abstraction. Files (Cloudinary today, R2/Supabase
// Storage later) are described by one metadata shape and kept out of the
// clinical database rows. Cloudinary behaviour is unchanged.
export const STORAGE_PROVIDERS = Object.freeze({ CLOUDINARY: 'cloudinary', R2: 'r2', SUPABASE: 'supabase' });

export function normalizeFileMeta(input = {}, provider = STORAGE_PROVIDERS.CLOUDINARY) {
  return {
    provider,
    key: input.public_id || input.key || input.id || '',
    url: input.src || input.url || input.cloudinary_url || '',
    name: input.name || '',
    type: input.type || input.modality || '',
    eye: input.eye || 'OU',
    date: input.date || '',
    notes: input.notes || '',
    access: input.access || 'public' // 'private' => signed URL via resolveFileUrl later
  };
}

const resolvers = {};
export function registerUrlResolver(provider, fn) { resolvers[provider] = fn; }

// Public files return the stored URL; private ones will use a signed-URL
// resolver once a provider registers one.
export async function resolveFileUrl(meta) {
  const r = resolvers[meta.provider];
  return r && meta.access === 'private' ? r(meta) : meta.url;
}
