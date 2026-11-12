'use strict';

const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Every issue id that should exist by now but does not.
 *
 * Looks back as far as the oldest existing issue (no time limit), so a slot that was missed
 * because the computer was off is written later instead of being skipped. With no issue at all
 * there is nothing to catch up on: only the latest slot counts.
 *
 * @param {string[]} schedule  times like "08:00"
 * @param {string[]} existingIds  ids of the issues that already exist
 * @param {Date} now
 * @param {number} graceMinutes  how long a run may take after its slot
 * @returns {{id: string, date: string, time: string}[]} oldest first
 */
function missingSlots(schedule, existingIds, now, graceMinutes = 0) {
  const times = [...new Set(schedule)].sort();
  const limit = new Date(now.getTime() - graceMinutes * 60_000);
  const have = new Set(existingIds);
  const oldest = [...existingIds].sort()[0];

  const slots = [];
  const first = oldest ? new Date(`${oldest.slice(0, 10)}T00:00:00`) : new Date(limit.getTime() - 86_400_000);
  for (const day = new Date(first); day <= limit; day.setDate(day.getDate() + 1)) {
    const date = dayOf(day);
    for (const time of times) {
      const [h, m] = time.split(':').map(Number);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      if (at > limit) continue;
      slots.push({ id: `${date}-${time.replace(':', '')}`, date, time, at });
    }
  }

  const due = oldest ? slots : slots.slice(-1);
  return due
    .filter((slot) => !have.has(slot.id) && (!oldest || slot.id > oldest))
    .map(({ id, date, time }) => ({ id, date, time }));
}

module.exports = { missingSlots };
