import { sbUpsert, sbSelect, getConfigValue } from './supabase.js';

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ── MLB ──────────────────────────────────────────────────────────────────────

// standingsMap is fetched once per sync and passed in to avoid repeated API calls
async function enrichMlb(event, config, standingsMap = {}) {
  const dateStr = (event.start_date || (event.start_at ? event.start_at.split('T')[0] : null));
  if (!dateStr) throw new Error('No date for MLB event');

  const teamId = config.teamId;
  const json = await fetchJson(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateStr}&teamId=${teamId}&hydrate=linescore,decisions,team`
  );

  const game = json?.dates?.[0]?.games?.[0];
  if (!game) return null;

  const status = game.status?.detailedState || 'Scheduled';
  const home = game.teams?.home;
  const away = game.teams?.away;
  const isHome = String(home?.team?.id) === String(teamId);

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
    walkoffNote: linescore.note || null,
    seriesGame: game.seriesGameNumber || null,
    seriesTotal: game.gamesInSeries || null,
    occasion: game.description || null,
    venue: game.venue?.name || null,
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

// ── NBA ──────────────────────────────────────────────────────────────────────

async function enrichNba(event, config) {
  const dateStr = (event.start_date || (event.start_at ? event.start_at.split('T')[0] : null));
  if (!dateStr) throw new Error('No date for NBA event');

  const yyyymmdd = dateStr.replace(/-/g, '');
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yyyymmdd}`;
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
  const period = comp?.status?.period || null;
  const clock  = comp?.status?.displayClock || null;

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
    period,
    clock,
  };
}

// ── NHL ──────────────────────────────────────────────────────────────────────

async function enrichNhl(event, config) {
  const dateStr = (event.start_date || (event.start_at ? event.start_at.split('T')[0] : null));
  if (!dateStr) throw new Error('No date for NHL event');

  // Step 1: find the game on the scoreboard
  const scoreJson = await fetchJson(`https://api-web.nhle.com/v1/score/${dateStr}`);
  const abbrev = (config.teamId || '').toUpperCase();
  const game = (scoreJson?.games || []).find((g) =>
    g.homeTeam?.abbrev?.toUpperCase() === abbrev || g.awayTeam?.abbrev?.toUpperCase() === abbrev
  );
  if (!game) return null;

  const statusCode = game.gameState || 'FUTURE';
  const isFinal = statusCode === 'OFF' || statusCode === 'FINAL';
  const isLive  = statusCode === 'LIVE' || statusCode === 'CRIT';

  const base = {
    status: statusCode,
    homeTeam: { abbrev: game.homeTeam?.abbrev, name: game.homeTeam?.commonName?.default || game.homeTeam?.abbrev },
    awayTeam: { abbrev: game.awayTeam?.abbrev, name: game.awayTeam?.commonName?.default || game.awayTeam?.abbrev },
    homeScore: game.homeTeam?.score ?? null,
    awayScore: game.awayTeam?.score ?? null,
    period: game.period || null,
    periodType: game.periodType || null,
  };

  // Step 2: fetch boxscore for completed or live games
  if (!isFinal && !isLive) return base;

  let box;
  try {
    box = await fetchJson(`https://api-web.nhle.com/v1/gamecenter/${game.id}/boxscore`);
  } catch (e) {
    return base; // boxscore unavailable — fall back to basic score
  }

  // Shots on goal — confirmed on team object directly
  const homeShots = box?.homeTeam?.sog ?? null;
  const awayShots = box?.awayTeam?.sog ?? null;

  // Finish type (OT/SO/REG) from gameOutcome
  const lastPeriodType = box?.gameOutcome?.lastPeriodType || null;

  // Goalies — use starter flag, confirmed field names from API
  function pickGoalie(goalies) {
    if (!goalies?.length) return null;
    const g = goalies.find(gl => gl.starter) || goalies[0];
    const pct = g.savePctg != null
      ? g.savePctg.toFixed(3).replace(/^0/, '')
      : null;
    return {
      name: g.name?.default || '',
      saves: g.saves ?? null,
      shots: g.shotsAgainst ?? null,
      savePct: pct,
      decision: g.decision || null,
    };
  }

  const playerStats = box?.playerByGameStats;
  const homeGoalie = pickGoalie(playerStats?.homeTeam?.goalies);
  const awayGoalie = pickGoalie(playerStats?.awayTeam?.goalies);

  // Goals + period linescore live in the landing endpoint — fetch separately
  let periods    = [];
  let goals      = [];
  let homePP     = null;
  let awayPP     = null;
  let threeStars = [];

  try {
    const landing = await fetchJson(`https://api-web.nhle.com/v1/gamecenter/${game.id}/landing`);
    const summary = landing?.summary;

    // Goal log — scoring is an array of period objects, each with a goals array
    const homeAbbrev = box?.homeTeam?.abbrev?.toUpperCase();
    const periodMap  = {};

    for (const period of (summary?.scoring || [])) {
      const pType = period.periodDescriptor?.periodType;
      const pNum  = period.periodDescriptor?.number ?? period.period;
      const pDesc = pType === 'OT' ? 'OT' : pType === 'SO' ? 'SO' : `P${pNum}`;

      if (!periodMap[pDesc]) periodMap[pDesc] = { periodDesc: pDesc, home: 0, away: 0 };

      for (const g of (period.goals || [])) {
        const isHome = g.teamAbbrev?.default?.toUpperCase() === homeAbbrev;
        if (isHome) periodMap[pDesc].home++;
        else        periodMap[pDesc].away++;

        goals.push({
          teamAbbrev:  g.teamAbbrev?.default || null,
          scorer:      g.name?.default || null,
          scorerTotal: g.goalsToDate ?? null,
          assists:     (g.assists || []).map((a) => a.name?.default || '').filter(Boolean),
          period:      pDesc,
          timeInPeriod: g.timeInPeriod || null,
          strength:    g.strength || 'ev',
          emptyNet:    g.goalModifier === 'empty-net' || false,
        });
      }
    }

    // Period grid derived from goal counts (no linescore endpoint available)
    periods = Object.values(periodMap);

    // Three Stars
    threeStars = (summary?.threeStars || [])
      .sort((a, b) => a.star - b.star)
      .map((s) => ({
        star:      s.star,
        name:      s.name?.default || null,
        teamAbbrev: s.teamAbbrev || null,
        position:  s.position || null,
      }));

    // Power play — derive from goalie's PP stats in boxscore
    function ppFromGoalie(goalie) {
      if (!goalie) return null;
      const ppga = goalie.powerPlayGoalsAgainst ?? null;
      const ppsa = goalie.powerPlayShotsAgainst || '';   // "saves/shots"
      const opps = parseInt(ppsa.split('/')[1]) || null;
      return ppga != null && opps != null ? `${ppga}/${opps}` : null;
    }
    const rawGoalies = box?.playerByGameStats;
    const homeGData  = rawGoalies?.homeTeam?.goalies?.find(g => g.starter) || rawGoalies?.homeTeam?.goalies?.[0];
    const awayGData  = rawGoalies?.awayTeam?.goalies?.find(g => g.starter) || rawGoalies?.awayTeam?.goalies?.[0];
    // Home PP = goals scored against away goalie; away PP = goals against home goalie
    homePP = ppFromGoalie(awayGData);
    awayPP = ppFromGoalie(homeGData);

  } catch (e) {
    console.warn('[Sports] NHL landing fetch failed:', e.message);
  }

  return {
    ...base,
    lastPeriodType,
    periods,
    goals,
    homeShots,
    awayShots,
    homePP,
    awayPP,
    homeGoalie,
    awayGoalie,
    threeStars,
  };
}

// ── Golf ─────────────────────────────────────────────────────────────────────

async function enrichGolf(event, config) {
  const startStr = (event.start_date || (event.start_at ? event.start_at.split('T')[0] : null));
  if (!startStr) throw new Error('No date for Golf event');

  // For multi-day tournaments use today's date so ESPN returns the live leaderboard.
  // Fall back to start date if today is outside the event window.
  const todayStr = new Date().toISOString().split('T')[0];
  const endStr   = event.end_date || startStr;
  const dateStr  = (todayStr >= startStr && todayStr < endStr) ? todayStr : startStr;

  const yyyymmdd = dateStr.replace(/-/g, '');
  const url = `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=${yyyymmdd}`;
  const json = await fetchJson(url);

  const ev = json?.events?.[0];
  if (!ev) return null;

  const display = config.display || {};
  const leaderboardSize = display.leaderboardSize || 10;
  const trackedNames = (display.trackedGolfers || []).map((n) => n.toLowerCase());

  const comp = ev.competitions?.[0];
  const currentRound = comp?.status?.period || 1;

  // Competitors come pre-sorted by position (order field = leaderboard position)
  const competitors = comp?.competitors || [];

  // Tie detection: find first order for each score value
  const scoreCounts = {};
  const scoreFirstOrder = {};
  for (const c of competitors) {
    const s = c.score;
    scoreCounts[s] = (scoreCounts[s] || 0) + 1;
    if (!Object.prototype.hasOwnProperty.call(scoreFirstOrder, s)) scoreFirstOrder[s] = c.order;
  }

  // Regex to detect a time string like "1:40 PM" or "10:05 AM"
  const TEE_TIME_RE = /^\d{1,2}:\d{2}\s*(AM|PM)/i;

  function mapCompetitor(c) {
    // Per-round linescores (top-level, one per round)
    const roundLinescores = (c.linescores || []).filter((ls) => ls.period != null);

    // Current round entry
    const currentRoundLs = roundLinescores.find((ls) => ls.period === currentRound);
    const todayDisplay = currentRoundLs?.displayValue;

    // Tee time: primary source is statistics.categories[0].stats[6].displayValue
    // (confirmed from ESPN API response); fallback to c.status.teeTime or a
    // time-looking string in the round's displayValue.
    const statsTeeTime = c.statistics?.categories?.[0]?.stats?.[6]?.displayValue || null;
    const statusTeeTime = c.status?.teeTime || null;
    const displayIsTeeTime = todayDisplay ? TEE_TIME_RE.test(todayDisplay) : false;
    const teeTime = statsTeeTime || statusTeeTime || (displayIsTeeTime ? todayDisplay : null);

    const isNotStarted = !todayDisplay || todayDisplay === '-' || displayIsTeeTime;

    // Thru: count of per-hole entries in current round's inner linescores
    const innerHoles = currentRoundLs?.linescores?.length || 0;
    let thru;
    if (innerHoles >= 18)    thru = 'F';
    else if (innerHoles > 0) thru = String(innerHoles);
    else if (isNotStarted)   thru = teeTime || '-';
    else                     thru = 'F';

    // Round scores: completed or in-progress rounds (exclude placeholders with no displayValue)
    const rounds = roundLinescores
      .filter((ls) => ls.displayValue && ls.displayValue !== '-')
      .sort((a, b) => a.period - b.period)
      .map((ls) => ls.displayValue);

    // Position text with tie prefix
    const isTied = scoreCounts[c.score] > 1;
    const posText = c.order != null
      ? (isTied ? `T${scoreFirstOrder[c.score]}` : String(c.order))
      : '—';

    // Normalise score: API may return "0", "", null, or "E" for even par
    const rawScore = c.score;
    const normScore = (!rawScore || rawScore === '0' || rawScore === 'E') ? 'E' : rawScore;

    // Normalise today: guard against tee-time strings leaking into Today column
    const normToday = isNotStarted ? null
                    : (!todayDisplay || todayDisplay === '-' || todayDisplay === '0') ? null
                    : todayDisplay;

    return {
      positionText: posText,
      name: c.athlete?.displayName || '?',
      score: normScore,
      today: isNotStarted ? null : normToday,
      thru,
      rounds,
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

  // Build ESPN leaderboard deep-link using the event ID from the API
  const espnUrl = ev.id
    ? `https://www.espn.com/golf/leaderboard?tournamentId=${ev.id}`
    : 'https://www.espn.com/golf/leaderboard';

  return {
    tournamentName: ev.name || 'PGA Tour',
    status: statusStr,
    currentRound,
    leaderboard: top,
    trackedGolfers: tracked,
    cutLine: comp?.notes?.find((n) => n.type === 'cut')?.headline || null,
    espnUrl,
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

// ── NASCAR ───────────────────────────────────────────────────────────────────

async function enrichNascar(event) {
  const dateStr = (event.start_date || (event.start_at ? event.start_at.split('T')[0] : null));
  if (!dateStr) throw new Error('No date for NASCAR event');

  const yyyymmdd = dateStr.replace(/-/g, '');
  const url = `https://site.api.espn.com/apis/site/v2/sports/racing/nascar-premier/scoreboard?dates=${yyyymmdd}`;
  const json = await fetchJson(url);

  const ev = json?.events?.[0];
  if (!ev) return null;

  const comp = ev.competitions?.[0];
  const statusStr = comp?.status?.type?.description || 'Scheduled';
  const competitors = (comp?.competitors || [])
    .sort((a, b) => (parseInt(a.order) || 99) - (parseInt(b.order) || 99))
    .slice(0, 10)
    .map((c) => ({
      position: c.order || c.id,
      name: c.athlete?.displayName || c.team?.displayName || 'Unknown',
      number: c.athlete?.jersey || c.team?.abbreviation || '',
      laps: c.laps || null,
    }));

  return {
    raceName: ev.name || ev.shortName || 'NASCAR Race',
    status: statusStr,
    results: competitors,
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

  // 2. Fetch recent calendar events (3 days back + future)
  const lookback = new Date();
  lookback.setDate(lookback.getDate() - 3);
  lookback.setHours(0, 0, 0, 0);
  const lookbackIso = lookback.toISOString();
  const yStr = lookbackIso.split('T')[0];

  let calEvents;
  try {
    calEvents = await sbSelect(env, 'calendar_events', {
      select: 'google_id,calendar_id,summary,start_date,start_at',
      or: `(start_date.gte.${yStr},start_at.gte.${lookbackIso})`,
    });
  } catch (err) {
    console.warn('[Sports] Failed to fetch calendar events:', err.message);
    return;
  }

  if (!calEvents?.length) {
    console.log('[Sports] No recent calendar events to enrich.');
    return;
  }

  // 3. Fetch MLB standings once for all MLB games (saves one API call per game)
  const needsMlb = sportsConfig.some((sc) => sc.sport === 'mlb');
  let mlbStandingsMap = {};
  if (needsMlb) {
    const year = new Date().getFullYear();
    try {
      const standingsJson = await fetchJson(
        `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${year}`
      );
      for (const divRecord of (standingsJson?.records || [])) {
        // Skip wildcard and league-level records — they have no division and
        // would overwrite valid division entries with a null divisionName
        if (!divRecord.division?.id) continue;
        const divName = divRecord.division.nameShort || divRecord.division.name || '';
        for (const tr of (divRecord.teamRecords || [])) {
          mlbStandingsMap[tr.team.id] = {
            rank: tr.divisionRank || null,
            divisionName: divName || null,
            gb: tr.gamesBack || '-',
          };
        }
      }
    } catch (e) {
      console.warn('[Sports] Failed to fetch MLB standings:', e.message);
    }
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
          data = await enrichMlb(event, config, mlbStandingsMap);
          break;
        case 'nfl':
          data = await enrichNfl(event, config);
          break;
        case 'nba':
          data = await enrichNba(event, config);
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
        case 'nascar':
          data = await enrichNascar(event, config);
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
