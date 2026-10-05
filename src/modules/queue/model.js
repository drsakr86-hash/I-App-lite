// Pure queue logic for the waiting room (no React, no DOM) so it can be tested.

import { t } from "../i18n/index.js";

export const DEFAULT_EXAM_MINUTES = 15;
const MAX_EXAM_MS = 3 * 3600 * 1000;
const ACTIVE = ["waiting", "called", "in"];

const byTime = (a, b) => String(a.time || "").localeCompare(String(b.time || ""));

export function buildQueueView(apts, { today, priorityDoctor = "", doctorNames = [] } = {}) {
  const list = Array.isArray(apts) ? apts : [];
  const todayApts = list.filter(a => a.date === today).sort(byTime);
  const withStatus = s => todayApts.filter(a => a.waitStatus === s);
  const waiting = withStatus("waiting");
  const called = withStatus("called");
  const inRoom = withStatus("in");
  const done = withStatus("done");
  const postponed = withStatus("postponed");
  const noShow = withStatus("no-show");
  const pending = todayApts.filter(a => !a.waitStatus);

  const booked = new Set(list.filter(a => a.date === today && a.doctor).map(a => a.doctor));
  const priorityOptions = doctorNames.filter(d => booked.has(d));
  const stale = list.filter(a => a.date && a.date < today && ACTIVE.includes(a.waitStatus));

  const isPriority = a => !!priorityDoctor && a.doctor === priorityDoctor;
  const orderedWaiting = [...waiting.filter(isPriority), ...waiting.filter(a => !isPriority(a))];

  const durations = done
    .filter(a => a.inAt && a.doneAt)
    .map(a => a.doneAt - a.inAt)
    .filter(d => d > 0 && d < MAX_EXAM_MS);
  const avgDurationMin = durations.length
    ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length / 60000)
    : DEFAULT_EXAM_MINUTES;

  return {
    todayApts, waiting, called, inRoom, done, postponed, noShow, pending,
    stale, priorityOptions, orderedWaiting, avgDurationMin,
    hasDurations: durations.length > 0,
    isPriority
  };
}

export const fmtWait = mins =>
  mins < 60 ? t("g5.queue.waitMin", { n: mins }) : t("g5.queue.waitHrMin", { h: Math.floor(mins / 60), m: mins % 60 });

// Estimated wait for the idx-th waiting patient.
export function estimateWait(a, idx, { clock, inRoomCount, avgDurationMin }) {
  const sinceArrival = Math.max(0, Math.round((clock - (a.arrivedAt || Date.now())) / 60000));
  return sinceArrival || (idx + (inRoomCount ? 1 : 0)) * avgDurationMin;
}

// Status transitions: each returns the updated appointment (never mutates).
export const transitions = {
  arrive: a => ({ ...a, waitStatus: "waiting" }),
  call: (a, now) => ({ ...a, waitStatus: "called", calledAt: now }),
  startExam: (a, now) => ({ ...a, waitStatus: "in", inAt: now }),
  finish: (a, now) => ({ ...a, waitStatus: "done", doneAt: now }),
  backToWaiting: a => ({ ...a, waitStatus: "waiting" }),
  postpone: a => ({ ...a, waitStatus: "postponed" }),
  noShow: (a, now) => ({ ...a, waitStatus: "no-show", noShowAt: now }),
  cancelArrival: a => ({ ...a, waitStatus: undefined }),
  // Admin: undo the whole queue state (waiting / called / in room) back to "not arrived"
  // and drop the timestamps that belonged to it, so wait/exam estimates are not skewed.
  cancelStatus: a => ({ ...a, waitStatus: undefined, arrivedAt: undefined, calledAt: undefined, inAt: undefined }),
  restoreNoShow: a => ({ ...a, waitStatus: "waiting", noShowAt: undefined })
};
