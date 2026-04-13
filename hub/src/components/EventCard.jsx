export default function EventCard({ event, calColor }) {
  const color = calColor || event.cal_color || '#4285f4';

  function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div
      className={`event-card${event.is_all_day ? ' all-day' : ''}`}
      style={{ '--cal-color': color }}
      title={event.description || event.summary}
    >
      {!event.is_all_day && (
        <span className="event-time">{formatTime(event.start_at)}</span>
      )}
      <span className="event-title">{event.summary}</span>
      <span className="event-cal">{event.cal_name}</span>
    </div>
  );
}
