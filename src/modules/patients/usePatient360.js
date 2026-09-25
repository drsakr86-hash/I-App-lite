import { useEffect, useState } from 'react';
import { getPatient360 } from './patient.service.js';

export function usePatient360(client, patientCode, options = {}) {
  const [state, setState] = useState({ data: null, loading: false, error: null });
  const refreshKey = options.refreshKey ?? 0;

  useEffect(() => {
    let active = true;
    if (!client || !patientCode) {
      setState({ data: null, loading: false, error: null });
      return () => { active = false; };
    }
    setState(prev => ({ ...prev, loading: true, error: null }));
    getPatient360(client, patientCode, options)
      .then(data => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch(error => {
        if (active) setState({ data: null, loading: false, error });
      });
    return () => { active = false; };
  }, [client, patientCode, refreshKey]);

  return state;
}
