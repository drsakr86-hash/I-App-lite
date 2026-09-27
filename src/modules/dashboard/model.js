// Pure home-screen (Dashboard) calculations — no React, no I/O.

const isActiveApt = a => !!a && !a.cancelled && a.status !== 'cancelled' && a.waitStatus !== 'cancelled';
const paidCost = v => (v.paid ? Number(v.cost || 0) : 0);

export function buildDashboardStats(visits, { today }) {
  const list = Array.isArray(visits) ? visits : [];
  const month = today.slice(0, 7);
  const todayVisits = list.filter(v => v.date === today);
  return {
    todayRevenue: todayVisits.reduce((s, v) => s + paidCost(v), 0),
    monthRevenue: list.filter(v => (v.date || '').startsWith(month)).reduce((s, v) => s + paidCost(v), 0),
    todayVisitCount: todayVisits.length,
    pendingPayment: todayVisits.filter(v => !v.paid).length
  };
}

export function averageRating(ratings) {
  const list = Array.isArray(ratings) ? ratings : [];
  if (!list.length) return null;
  return (list.reduce((s, r) => s + (r.rating || 0), 0) / list.length).toFixed(1);
}

// Today's appointments grouped by live queue status, for the attention banners.
export function todayQueueGroups(appointments, today) {
  const list = (Array.isArray(appointments) ? appointments : []).filter(a => a.date === today);
  return {
    called: list.filter(a => a.waitStatus === 'called'),
    waiting: list.filter(a => a.waitStatus === 'waiting'),
    inRoom: list.filter(a => a.waitStatus === 'in')
  };
}

export function recentAppointments(appointments, limit = 4) {
  return (Array.isArray(appointments) ? appointments : [])
    .filter(a => isActiveApt(a) && a.waitStatus !== 'done')
    .slice(0, limit);
}

export function emergencyPatients(patients) {
  return (Array.isArray(patients) ? patients : []).filter(p => p.status === 'طارئ');
}

export function buildDashboardData({ patients, appointments, visits, ratings }, { today }) {
  const stats = buildDashboardStats(visits, { today });
  return {
    ...stats,
    avgRating: averageRating(ratings),
    queue: todayQueueGroups(appointments, today),
    recentAppointments: recentAppointments(appointments),
    emergencies: emergencyPatients(patients),
    counts: {
      patients: (patients || []).length,
      appointmentsToday: (appointments || []).length,
      emergencies: emergencyPatients(patients).length
    }
  };
}
