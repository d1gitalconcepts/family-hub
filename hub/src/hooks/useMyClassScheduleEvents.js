import { useMemo } from 'react';
import { useSchoolSchedules } from './useSchoolSchedules';
import { useSchoolSchedulePeriods } from './useSchoolSchedulePeriods';
import { useSchoolClasses } from './useSchoolClasses';
import { useSchoolScheduleAssignments } from './useSchoolScheduleAssignments';
import { useSchoolCalendarExceptions } from './useSchoolCalendarExceptions';
import { dateStr, getDayKey, getDayEntries } from '../utils/schoolSchedule';

export const CLASS_SCHEDULE_CAL_ID = '__class_schedule';

// Turns the logged-in person's own class schedule into ordinary
// calendar-shaped events, so WeekView/SectionRow can render it like any
// other calendar instead of routing kids through the separate School
// Schedule screen (which stays the admin's management/view surface —
// see SchoolSchedule.jsx). Admins keep using that switcher-based view
// for checking on every kid, so this hook is a no-op for them even if
// they happen to have a schedule of their own linked.
//
// Returns { events, calendar }. `calendar` is null (and events []) when
// this person has no schedule of their own, or is an admin — WeekView
// only injects the virtual calendar into the grid when one exists.
export function useMyClassScheduleEvents(profile, days) {
  const schedules   = useSchoolSchedules();
  const exceptions  = useSchoolCalendarExceptions();
  const schedule    = schedules.find((s) => s.profile_id === profile?.id) || null;
  const scheduleId  = schedule?.id || null;
  const periods     = useSchoolSchedulePeriods(scheduleId);
  const [classes]   = useSchoolClasses(scheduleId);
  const assignments = useSchoolScheduleAssignments(scheduleId);

  return useMemo(() => {
    if (!schedule || profile?.is_admin) return { events: [], calendar: null };

    const exceptionsByDate = {};
    exceptions.forEach((e) => { exceptionsByDate[e.date] = e; });

    const events = (days || []).flatMap((day) => {
      const dayKey  = getDayKey(day, schedule, exceptionsByDate);
      const entries = getDayEntries(periods, assignments, classes || [], dayKey, day);
      const d       = dateStr(day);
      return entries.map(({ period, assignment, class: cls }) => ({
        google_id:   `class-${assignment.id}-${d}`,
        calendar_id: CLASS_SCHEDULE_CAL_ID,
        cal_name:    schedule.school_name || 'Class Schedule',
        summary:     cls.name,
        description: [cls.teacher, cls.room ? `Room ${cls.room}` : null].filter(Boolean).join(' · ') || null,
        location:    null,
        is_all_day:  false,
        // No trailing Z/offset — browsers parse a date-time string with no
        // timezone as local wall-clock time, matching how these periods
        // were entered (school local time, not UTC).
        start_at:    `${d}T${(period.start_time || '00:00').slice(0, 5)}:00`,
        end_at:      `${d}T${(period.end_time   || '00:00').slice(0, 5)}:00`,
      }));
    });

    const calendar = {
      id:      CLASS_SCHEDULE_CAL_ID,
      name:    schedule.school_name ? `🎒 ${schedule.school_name}` : '🎒 Class Schedule',
      color:   '#7c5cbf',
      emoji:   '🎒',
      visible: true,
    };

    return { events, calendar };
  }, [schedule, profile?.is_admin, periods, classes, assignments, exceptions, days]);
}
