import { useMemo } from 'react';
import { useSchoolSchedules } from './useSchoolSchedules';
import { useSchoolCalendarExceptions } from './useSchoolCalendarExceptions';
import { getDayKey } from '../utils/schoolSchedule';

// For each day in `days`, resolves the rotation day-letter/number of
// whichever schedules this person chose to show in the grid header (see
// profile.header_rotation_ids, set from "My Calendar View"). Only needs
// the day-key logic (no periods/classes), so it's much cheaper than
// useMyClassScheduleEvents.
//
// Returns an array parallel to `days`, each entry a list of
// { id, label } — label is bare ("A", "3") when only one schedule is
// selected, prefixed with that schedule's owner's first name when more
// than one is selected so they stay distinguishable.
export function useRotationDayLabels(profile, days) {
  const schedules  = useSchoolSchedules();
  const exceptions = useSchoolCalendarExceptions();

  return useMemo(() => {
    const selectedIds = new Set(profile?.header_rotation_ids || []);
    if (selectedIds.size === 0) return [];
    const selected = schedules.filter((s) => selectedIds.has(s.id));
    if (selected.length === 0) return [];

    const exceptionsByDate = {};
    exceptions.forEach((e) => { exceptionsByDate[e.date] = e; });
    const multiple = selected.length > 1;

    return (days || []).map((day) =>
      selected
        .map((s) => {
          const key = getDayKey(day, s, exceptionsByDate);
          if (!key) return null;
          const firstName = (s.profile?.display_name || '').split(' ')[0];
          return { id: s.id, label: multiple && firstName ? `${firstName} ${key}` : key };
        })
        .filter(Boolean)
    );
  }, [profile?.header_rotation_ids, schedules, exceptions, days]);
}
