import { useCallback, useState } from 'react';
import { rpc } from '../services/rpc.js';

export function useRpc(client) {
  const [state, setState] = useState({ loading: false, error: null, data: null });
  const execute = useCallback(async (functionName, args = {}, options = {}) => {
    setState({ loading: true, error: null, data: null });
    try {
      const data = await rpc(client, functionName, args, options);
      setState({ loading: false, error: null, data });
      return data;
    } catch (error) {
      setState({ loading: false, error, data: null });
      throw error;
    }
  }, [client]);
  return { ...state, execute };
}
