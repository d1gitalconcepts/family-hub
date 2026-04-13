// WMO weather interpretation codes → emoji + label
const WMO = {
  0:  { emoji: '☀️',  label: 'Clear'           },
  1:  { emoji: '🌤️', label: 'Mostly Clear'     },
  2:  { emoji: '⛅',  label: 'Partly Cloudy'   },
  3:  { emoji: '☁️',  label: 'Overcast'        },
  45: { emoji: '🌫️', label: 'Fog'             },
  48: { emoji: '🌫️', label: 'Freezing Fog'    },
  51: { emoji: '🌦️', label: 'Light Drizzle'   },
  53: { emoji: '🌦️', label: 'Drizzle'         },
  55: { emoji: '🌦️', label: 'Heavy Drizzle'   },
  61: { emoji: '🌧️', label: 'Light Rain'      },
  63: { emoji: '🌧️', label: 'Rain'            },
  65: { emoji: '🌧️', label: 'Heavy Rain'      },
  71: { emoji: '🌨️', label: 'Light Snow'      },
  73: { emoji: '🌨️', label: 'Snow'            },
  75: { emoji: '🌨️', label: 'Heavy Snow'      },
  77: { emoji: '❄️',  label: 'Snow Grains'     },
  80: { emoji: '🌦️', label: 'Showers'         },
  81: { emoji: '🌦️', label: 'Showers'         },
  82: { emoji: '🌦️', label: 'Heavy Showers'   },
  85: { emoji: '🌨️', label: 'Snow Showers'    },
  86: { emoji: '🌨️', label: 'Heavy Snow Shwrs'},
  95: { emoji: '⛈️',  label: 'Thunderstorm'   },
  96: { emoji: '⛈️',  label: 'Thunderstorm'   },
  99: { emoji: '⛈️',  label: 'Thunderstorm'   },
};

function wmo(code) {
  if (WMO[code]) return WMO[code];
  if (code <= 2)  return { emoji: '🌤️', label: 'Partly Cloudy' };
  if (code <= 3)  return { emoji: '☁️',  label: 'Overcast'      };
  if (code <= 48) return { emoji: '🌫️', label: 'Fog'           };
  if (code <= 55) return { emoji: '🌦️', label: 'Drizzle'       };
  if (code <= 65) return { emoji: '🌧️', label: 'Rain'          };
  if (code <= 77) return { emoji: '🌨️', label: 'Snow'          };
  if (code <= 82) return { emoji: '🌦️', label: 'Showers'       };
  if (code <= 86) return { emoji: '🌨️', label: 'Snow Showers'  };
  return { emoji: '⛈️', label: 'Thunderstorm' };
}

export default function ForecastCard({ day }) {
  if (!day) return null;
  const { emoji, label } = wmo(day.code);
  return (
    <div className="forecast-card">
      <span className="forecast-emoji">{emoji}</span>
      <span className="forecast-label">{label}</span>
      <span className="forecast-temps">
        <span className="forecast-high">{day.high}°</span>
        <span className="forecast-sep">/</span>
        <span className="forecast-low">{day.low}°</span>
      </span>
      {day.precip > 0 && (
        <span className="forecast-precip">💧{day.precip}%</span>
      )}
    </div>
  );
}
