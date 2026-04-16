import { sbUpsert, sbSelect, getConfigValue } from './supabase.js';

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ── MLB ──────────────────────────────────────────────────────────────────────

async function enrichMlb(event, config) {
  const dateStr = (event.start_date || (event.start_at ? event.start_at.split('T')[0] : null));
  if (!dateStr) throw new Error('No date for MLB event');

  const teamId = config.teamId;
  const year = dateStr.split('-')[0];

  // Fetch game + standings in parallel
  const [json, standingsJson] = await Promise.all([
    fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateStr}&teamId=${teamId}&hydrate=linescore,decisions,team`),
    fetchJson(`https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${year}`).catch(() => null),
  ]);

  const game = json?.dates?.[0]?.games?.[0];
  if (!game) return null;

  const status = game.status?.detailedState || 'Scheduled';
  const home = game.teams?.home;
  const away = game.teams?.away;
  const isHome = String(home?.team?.id) === String(teamId);

  // Build standings lookup: teamId → { rank, divisionName, gb }
  const standingsMap = {};
  for (const divRecord of (standingsJson?.records || [])) {
    const divName = divRecord.division?.nameShort || divRecord.division?.name || '';
    for (const tr of (divRecord.teamRecords || [])) {
      standingsMap[tr.team.id] = {
        rank: tr.divisionRank || null,
        divisionName: divName,
        gb: tr.gamesBack || '-',
      };
    }
  }

  function buildRecord(teamData) {
    const lr = teamData?.leagueRecord;
    const standing = standingsMap[teamData?.team?.id] || {};
    if (!lr) return null;
    return {
      wins: lr.wins,
      losses: lr.losses,
      rank: standing.rank || null,
      divisionName: standing.divisionName || null,
      gb: standing.gb || lr.gb || '-',
    };
  }

  const linescore = game.linescore || {};
  const innings = (linescore.innings || []).map((inn) => ({
    num: inn.num,
    home: inn.home?.runs ?? '',
    away: inn.away?.runs ?? '',
  }));

  const decisions = game.decisions ? {
    winner: game.decisions.winner?.fullName || null,
    loser:  game.decisions.loser?.fullName  || null,
    save:   game.decisions.save?.fullName   || null,
  } : null;

  return {
    status,
    isHome,
    homeTeam: { id: home?.team?.id, abbrev: home?.team?.abbreviation, name: home?.team?.teamName },
    awayTeam: { id: away?.team?.id, abbrev: away?.team?.abbreviation, name: away?.team?.teamName },
    homeScore: home?.score ?? null,
    awayScore: away?.score ?? null,
    innings,
    totals: {
      home: { r: linescore.teams?.home?.runs ?? null, h: linescore.teams?.home?.hits ?? null, e: linescore.teams?.home?.errors ?? null },
      away: { r: linescore.teams?.away?.runs ?? null, h: linescore.teams?.away?.hits ?? null, e: linescore.teams?.away?.errors ?? null },
    },
    decisions,
    homeRecord: buildRecord(home),
    awayRecord: buildRecord(away),
    currentInning: linescore.currentInning || null,
    gamePk: game.gamePk,
  };
}

// ── NFL ──────────────────────────────────────────────────────────────────────

async function enrichNfl(event, config) {
  const dateStr = (event.start_date || (event.start_at ? event.start_at.split('T')[0] : null));
  if (!dateStr) throw new Error('No date for NFL event');

  const yyyymmdd = dateStr.replace(/-/g, '');
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${yyyymmdd}`;
  const json = await fetchJson(url);

  const abbrev = (config.teamId || '').toLowerCase();
  const game = (json?.events || []).find((ev) => {
    const comps = ev?.competitions?.[0]?.competitors || [];
    return comps.some((c) => c.team?.abbreviation?.toLowerCase() === abbrev);
  });
  if (!game) return null;

  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home');
  const away = competitors.find((c) => c.homeAway === 'away');

  const status = comp?.status?.type?.description || 'Scheduled';

  return {
    status,
    homeTeam: { abbrev: home?.team?.abbreviation, name: home?.team?.displayName },
    awayTeam: { abbrev: away?.team?.abbreviation, name: away?.team?.displayName },
    homeScore: home?.score != null ? Number(home.score) : null,
    awayScore: away?.score != null ? Number(away.score) : null,
    homeLinescores: (home?.linescores || []).map((l) => l.value),
    awayLinescores: (away?.linescores || []).map((l) => l.value),
    homeRecord: home?.records?.[0]?.summary || null,
    awayRecord: away?.records?.[0]?.summary || null,
    period: comp?.status?.period || null,
    clock: comp?.status?.displayClock || null,
  };
}

// ── NHL ──────────────────────────────────────────────────────────────────────

async function enrichNhl(event, config) {
  const dateStr = (event.start_date || (event.start_at ? event.start_at.split('T')[0] : null));
  if (!dateStr) throw new Error('No date for NHL event');

  const url = `https://api-web.nhle.com/v1/score/${dateStr}`;
  const json = await fetchJson(url);

  const abbrev = (config.teamId || '').toUpperCase();
  const game = (json?.games || []).find((g) => {
    return g.homeTeam?.abbrev?.toUpperCase() === abbrev || g.awayTeam?.abbrev?.toUpperCase() === abbrev;
  });
  if (!game) return null;

  const statusCode = game.gameState || 'FUTURE';

  return {
    status: statusCode,
    homeTeam: { abbrev: game.homeTeam?.abbrev, name: game.homeTeam?.name?.default || game.homeTeam?.abbrev },
    awayTeam: { abbrev: game.awayTeam?.abbrev, name: game.awayTeam?.name?.default || game.awayTeam?.abbrev },
    homeScore: game.homeTeam?.score ?? null,
    awayScore: game.awayTeam?.score ?? null,
    period: game.period || null,
    periodType: game.periodType || null,
  };
}

// ── Golf ─────────────────────────────────────────────────────────────────────

async function enrichGolf(event, config) {
  const dateStr = (event.start_date || (event.start_at ? event.start_at.split('T')[0] : null));
  if (!dateStr) throw new Error('No date for Golf event');

  const yyyymmdd = dateStr.replace(/-/g, '');
  const url = `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=${yyyymmdd}`;
  const json = await fetchJson(url);

  const ev = json?.events?.[0];
  if (!ev) return null;

  const display = config.display || {};
  const leaderboardSize = display.leaderboardSize || 10;
  const trackedNames = (display.trackedGolfers || []).map((n) => n.toLowerCase());

  const comp = ev.competitions?.[0];
  const competitors = (comp?.competitors || []).sort((a, b) => {
    const posA = parseInt(a.status?.position?.id || a.sortOrder || 9999, 10);
    const posB = parseInt(b.status?.position?.id || b.sortOrder || 9999, 10);
    return posA - posB;
  });

  function mapCompetitor(c) {
    return {
      positionText: c.status?.position?.displayName || c.status?.type?.shortDetail || '—',
      name: c.athlete?.displayName || '?',
      score: c.score?.displayValue || 'E',
      today: c.statistics?.find((s) => s.name === 'scoringAverage')?.displayValue || null,
      thru: c.status?.thru != null ? String(c.status.thru) : (c.status?.type?.shortDetail || '—'),
      rounds: (c.linescores || []).map((l) => l.displayValue),
    };
  }

  const top = competitors.slice(0, leaderboardSize).map(mapCompetitor);
  const topNameSet = new Set(top.map((c) => c.name.toLowerCase()));

  const tracked = trackedNames.length > 0
    ? competitors
        .filter((c) => trackedNames.includes((c.athlete?.displayName || '').toLowerCase()))
        .map((c) => ({ ...mapCompetitor(c), isTracked: true }))
        .filter((c) => !topNameSet.has(c.name.toLowerCase()))
    : [];

  const statusStr = comp?.status?.type?.description || ev.status?.type?.description || 'In Progress';
  const currentRound = comp?.status?.period || null;

  return {
    tournamentName: ev.name || 'PGA Tour',
    status: statusStr,
    currentRound,
    leaderboard: top,
    trackedGolfers: tracked,
    cutLine: comp?.notes?.find((n) => n.type === 'cut')?.headline || null,
  };
}

// ── F1 ───────────────────────────────────────────────────────────────────────

function detectF1SessionType(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('sprint') && t.includes('qualify')) return 'Sprint Qualifying';
  if (t.includes('sprint')) return 'Sprint';
  if (t.includes('qualify')) return 'Qualifying';
  if (t.includes('practice 1') || t.includes('fp1')) return 'Practice 1';
  if (t.includes('practice 2') || t.includes('fp2')) return 'Practice 2';
  if (t.includes('practice 3') || t.includes('fp3')) return 'Practice 3';
  return 'Race';
}

async function enrichF1(event) {
  const dateStr = (event.start_date || (event.start_at ? event.start_at.split('T')[0] : null));
  if (!dateStr) throw new Error('No date for F1 event');

  const year = dateStr.split('-')[0];
  const sessionType = detectF1SessionType(event.summary);

  const sessionsUrl = `https://api.openf1.org/v1/sessions?year=${year}&date_start>=${dateStr}`;
  const sessions = await fetchJson(sessionsUrl);

  if (!sessions?.length) return null;

  // Find the session closest to event date with matching type
  const typeMap = {
    'Race': 'Race',
    'Qualifying': 'Qualifying',
    'Sprint': 'Sprint',
    'Sprint Qualifying': 'Sprint Qualifying',
    'Practice 1': 'Practice 1',
    'Practice 2': 'Practice 2',
    'Practice 3': 'Practice 3',
  };

  const wantedType = typeMap[sessionType] || 'Race';
  const matching = sessions.filter((s) => s.session_type === wantedType || s.session_name === wantedType);
  const session = matching.length > 0 ? matching[0] : sessions[0];

  const sessionKey = session.session_key;
  if (!sessionKey) return null;

  const [positions, drivers] = await Promise.all([
    fetchJson(`https://api.openf1.org/v1/position?session_key=${sessionKey}&position<=10`),
    fetchJson(`https://api.openf1.org/v1/drivers?session_key=${sessionKey}`),
  ]);

  // Build driver map
  const driverMap = {};
  for (const d of (drivers || [])) {
    driverMap[d.driver_number] = d;
  }

  // Get last position entry per driver (most recent), then sort by position
  const latestByDriver = {};
  for (const p of (positions || [])) {
    const existing = latestByDriver[p.driver_number];
    if (!existing || new Date(p.date) > new Date(existing.date)) {
      latestByDriver[p.driver_number] = p;
    }
  }

  const topResults = Object.values(latestByDriver)
    .filter((p) => p.position <= 10)
    .sort((a, b) => a.position - b.position)
    .map((p) => {
      const d = driverMap[p.driver_number] || {};
      return {
        position: p.position,
        name: d.full_name || d.broadcast_name || `Driver ${p.driver_number}`,
        acronym: d.name_acronym || '???',
        team: d.team_name || null,
        teamColor: d.team_colour || null,
      };
    });

  const now = new Date();
  const sessionEnd = session.date_end ? new Date(session.date_end) : null;
  const status = sessionEnd && now > sessionEnd ? 'Final' : 'In Progress';

  return {
    sessionType: session.session_name || sessionType,
    circuitName: session.circuit_short_name || session.location || null,
    countryName: session.country_name || null,
    status,
    topResults,
  };
}

// ── Main enrichment function ──────────────────────────────────────────────────

export async function enrichSportsEvents(env) {
  // 1. Load sports config
  const sportsConfig = await getConfigValue(env, 'sports_config');
  if (!sportsConfig || !sportsConfig.length) {
    console.log('[Sports] No sports_config found, skipping enrichment.');
    return;
  }

  // 2. Fetch recent calendar events
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString();
  const yStr = yesterdayIso.split('T')[0];

  let calEvents;
  try {
    calEvents = await sbSelect(env, 'calendar_events', {
      select: 'google_id,calendar_id,summary,start_date,start_at',
      or: `(start_date.gte.${yStr},start_at.gte.${yesterdayIso})`,
    });
  } catch (err) {
    console.warn('[Sports] Failed to fetch calendar events:', err.message);
    return;
  }

  if (!calEvents?.length) {
    console.log('[Sports] No recent calendar events to enrich.');
    return;
  }

  const enrichments = [];

  for (const event of calEvents) {
    // Find matching sports config entry
    const config = sportsConfig.find((sc) => {
      if (sc.calendarId !== event.calendar_id) return false;
      if (sc.keyword) {
        const summary = (event.summary || '').toLowerCase();
        return summary.includes(sc.keyword.toLowerCase());
      }
      return true;
    });

    if (!config) continue;

    try {
      let data = null;

      switch (config.sport) {
        case 'mlb':
          data = await enrichMlb(event, config);
          break;
        case 'nfl':
          data = await enrichNfl(event, config);
          break;
        case 'nhl':
          data = await enrichNhl(event, config);
          break;
        case 'golf':
          data = await enrichGolf(event, config);
          break;
        case 'f1':
          data = await enrichF1(event, config);
          break;
        default:
          console.warn(`[Sports] Unknown sport: ${config.sport}`);
      }

      if (data) {
        enrichments.push({
          google_event_id: event.google_id,
          sport: config.sport,
          data,
          fetched_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn(`[Sports] Failed to enrich event "${event.summary}" (${config.sport}):`, err.message);
    }
  }

  if (enrichments.length > 0) {
    await sbUpsert(env, 'sports_enrichment', enrichments);
    console.log(`[Sports] Upserted ${enrichments.length} enrichment(s).`);
  } else {
    console.log('[Sports] No enrichments to upsert.');
  }
}
