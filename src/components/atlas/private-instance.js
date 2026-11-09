// One private-storage instance per page (one signed-URL cache), created on first use and only when the flag is on.
import { enablePrivateStorage, privateStorageEnabled } from '../../services/private-storage.js';
import { getSB } from '../../modules/data-access/index.js';

let inst = null;
export function getPrivateStorage() {
  if (!privateStorageEnabled()) return null;
  if (!inst) { try { inst = enablePrivateStorage({ client: getSB() }); } catch { inst = null; } }
  return inst;
}
