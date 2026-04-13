import { useState } from 'react';
import { useConfig } from '../hooks/useConfig';

export default function AdminSettings({ onClose }) {
  const [calConfig, setCalConfig] = useConfig('visible_calendars');
  const [personTags, setPersonTags] = useConfig('person_tags');

  const calendars = calConfig || [];
  const tags = personTags || [];

  function updateCalendar(id, field, value) {
    const updated = calendars.map((c) => c.id === id ? { ...c, [field]: value } : c);
    setCalConfig(updated);
  }

  function getPersonTag(calId) {
    return tags.find((t) => t.calendar_id === calId)?.person_name || '';
  }

  function setPersonTag(calId, name) {
    const existing = tags.filter((t) => t.calendar_id !== calId);
    const updated = name ? [...existing, { calendar_id: calId, person_name: name }] : existing;
    setPersonTags(updated);
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel-header">
          Settings
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="settings-body">

          <div className="settings-section">
            <h3>Calendars</h3>
            {calendars.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                No calendars yet — the server will populate this on its next poll.
              </p>
            )}
            {calendars.map((cal) => (
              <div key={cal.id} className="cal-row">
                {/* Visibility toggle */}
                <input
                  type="checkbox"
                  checked={cal.visible !== false}
                  onChange={(e) => updateCalendar(cal.id, 'visible', e.target.checked)}
                  style={{ accentColor: cal.color }}
                />
                {/* Color dot */}
                <span className="cal-dot" style={{ background: cal.color }} />
                {/* Color picker */}
                <input
                  type="color"
                  className="cal-color-input"
                  value={cal.color || '#4285f4'}
                  onChange={(e) => updateCalendar(cal.id, 'color', e.target.value)}
                  title="Change color"
                />
                {/* Display name */}
                <input
                  className="cal-name-input"
                  value={cal.name || ''}
                  onChange={(e) => updateCalendar(cal.id, 'name', e.target.value)}
                  placeholder="Calendar name"
                />
                {/* Person tag */}
                <input
                  className="person-tag-input"
                  value={getPersonTag(cal.id)}
                  onChange={(e) => setPersonTag(cal.id, e.target.value)}
                  placeholder="Person"
                />
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
