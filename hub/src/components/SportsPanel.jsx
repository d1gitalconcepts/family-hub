function ordinal(n) {
  if (!n) return '';
  const num = parseInt(n, 10);
  const s = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatGb(gb) {
  if (!gb || gb === '-') return null;
  // MLB API returns ".5" instead of "0.5" — add leading zero
  const s = String(gb);
  return s.startsWith('.') ? `0${s}` : s;
}

function recordLine(abbrev, rec) {
  if (!rec) return null;
  let line = `${abbrev} ${rec.wins}-${rec.losses}`;
  if (rec.rank && rec.divisionName) {
    line += ` · ${ordinal(rec.rank)} ${rec.divisionName}`;
  } else {
    const gb = formatGb(rec.gb);
    if (gb) line += ` · ${gb} GB`;
  }
  return line;
}

const SPORT_EMOJI = {
  mlb:    '⚾',
  nfl:    '🏈',
  nhl:    '🏒',
  nba:    '🏀',
  golf:   '⛳',
  f1:     '🏎️',
  nascar: '🏁',
};

function StatusBadge({ sport, status }) {
  return (
    <span className="sports-status-badge">
      {SPORT_EMOJI[sport] || '🏆'} {status}
    </span>
  );
}

// ── MLB Panel ────────────────────────────────────────────────────────────────

function MlbPanel({ data, detail }) {
  const { status, homeTeam, awayTeam, homeScore, awayScore, innings, totals, decisions,
          homeRecord, awayRecord, walkoffNote, seriesGame, seriesTotal, occasion, venue } = data;
  const isScheduled = status === 'Scheduled' || status === 'Pre-Game';
  const showBox  = detail === 'boxscore' || detail === 'all';
  const showAll  = detail === 'all';

  return (
    <div>
      <div className="sports-panel-header">
        <StatusBadge sport="mlb" status={status} />
        {seriesGame && seriesTotal && (
          <span style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)' }}>
            Game {seriesGame} of {seriesTotal}
          </span>
        )}
      </div>

      {showAll && occasion && (
        <div style={{ fontSize: 'var(--s-xs)', color: 'var(--accent)', fontWeight: 600, marginBottom: 6 }}>
          {occasion}
        </div>
      )}

      {/* Score row — records shown in boxscore+ */}
      <div className="sports-score-row">
        <div className="sports-score-team sports-score-team--away">
          <span>{awayTeam?.abbrev}</span>
          {showBox && awayRecord && <span className="sports-score-record">{awayRecord.wins}-{awayRecord.losses}{awayRecord.rank && awayRecord.divisionName ? ` · ${ordinal(awayRecord.rank)} ${awayRecord.divisionName}` : ''}</span>}
        </div>
        <div className="sports-score-num">{awayScore ?? (isScheduled ? '—' : '0')}</div>
        <div className="sports-score-divider">·</div>
        <div className="sports-score-num">{homeScore ?? (isScheduled ? '—' : '0')}</div>
        <div className="sports-score-team sports-score-team--home">
          <span>{homeTeam?.abbrev}</span>
          {showBox && homeRecord && <span className="sports-score-record">{homeRecord.wins}-{homeRecord.losses}{homeRecord.rank && homeRecord.divisionName ? ` · ${ordinal(homeRecord.rank)} ${homeRecord.divisionName}` : ''}</span>}
        </div>
      </div>

      {/* Linescore — box score+ */}
      {showBox && !isScheduled && innings?.length > 0 && (
        <div className="sports-linescore-wrap">
          <table className="sports-linescore">
            <thead>
              <tr>
                <th></th>
                {innings.map((inn) => <th key={inn.num}>{inn.num}</th>)}
                <th className="col-totals">R</th>
                <th className="col-totals">H</th>
                <th className="col-totals">E</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{awayTeam?.abbrev}</td>
                {innings.map((inn) => <td key={inn.num}>{inn.away !== '' ? inn.away : 'x'}</td>)}
                <td className="col-totals">{totals?.away?.r ?? '—'}</td>
                <td className="col-totals">{totals?.away?.h ?? '—'}</td>
                <td className="col-totals">{totals?.away?.e ?? '—'}</td>
              </tr>
              <tr>
                <td>{homeTeam?.abbrev}</td>
                {innings.map((inn) => <td key={inn.num}>{inn.home !== '' ? inn.home : 'x'}</td>)}
                <td className="col-totals">{totals?.home?.r ?? '—'}</td>
                <td className="col-totals">{totals?.home?.h ?? '—'}</td>
                <td className="col-totals">{totals?.home?.e ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Decisions — box score+ */}
      {showBox && decisions && (decisions.winner || decisions.loser) && (
        <div className="sports-decisions">
          {decisions.winner && <span>W: {decisions.winner}</span>}
          {decisions.loser  && <span>L: {decisions.loser}</span>}
          {decisions.save   && <span>S: {decisions.save}</span>}
        </div>
      )}

      {showAll && walkoffNote && (
        <div style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 6 }}>
          {walkoffNote}
        </div>
      )}

      {showAll && venue && (
        <div style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
          📍 {venue}
        </div>
      )}

    </div>
  );
}

// ── NFL Panel ────────────────────────────────────────────────────────────────

function NflPanel({ data, detail }) {
  const { status, homeTeam, awayTeam, homeScore, awayScore, homeLinescores, awayLinescores, homeRecord, awayRecord, period, clock } = data;
  const showBox = detail === 'boxscore' || detail === 'all';
  const quarters = homeLinescores?.length > 4
    ? ['Q1','Q2','Q3','Q4',...homeLinescores.slice(4).map((_,i) => `OT${i+1}`)]
    : ['Q1','Q2','Q3','Q4'];

  return (
    <div>
      <div className="sports-panel-header">
        <StatusBadge sport="nfl" status={status} />
        {period && clock && <span style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)' }}>Q{period} {clock}</span>}
      </div>

      <div className="sports-score-row">
        <div className="sports-score-team sports-score-team--away">{awayTeam?.name}</div>
        <div className="sports-score-num">{awayScore ?? '—'}</div>
        <div className="sports-score-divider">·</div>
        <div className="sports-score-num">{homeScore ?? '—'}</div>
        <div className="sports-score-team sports-score-team--home">{homeTeam?.name}</div>
      </div>

      {showBox && homeLinescores?.length > 0 && (
        <div className="sports-linescore-wrap">
          <table className="sports-linescore">
            <thead>
              <tr>
                <th></th>
                {quarters.map((q) => <th key={q}>{q}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{awayTeam?.abbrev || awayTeam?.name}</td>
                {(awayLinescores || []).map((s, i) => <td key={i}>{s}</td>)}
              </tr>
              <tr>
                <td>{homeTeam?.abbrev || homeTeam?.name}</td>
                {(homeLinescores || []).map((s, i) => <td key={i}>{s}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {showBox && (homeRecord || awayRecord) && (
        <div className="sports-record">
          {awayRecord} · {homeRecord}
        </div>
      )}
    </div>
  );
}

// ── NBA Panel ────────────────────────────────────────────────────────────────

function NbaPanel({ data, detail }) {
  const { status, homeTeam, awayTeam, homeScore, awayScore, homeLinescores, awayLinescores, homeRecord, awayRecord, period, clock } = data;
  const showBox = detail === 'boxscore' || detail === 'all';
  const quarters = homeLinescores?.length > 4
    ? ['Q1','Q2','Q3','Q4',...homeLinescores.slice(4).map((_,i) => `OT${i+1}`)]
    : ['Q1','Q2','Q3','Q4'];

  return (
    <div>
      <div className="sports-panel-header">
        <StatusBadge sport="nba" status={status} />
        {period && clock && <span style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)' }}>Q{period} {clock}</span>}
      </div>

      <div className="sports-score-row">
        <div className="sports-score-team sports-score-team--away">
          <span>{awayTeam?.abbrev}</span>
          {showBox && awayRecord && <span className="sports-score-record">{awayRecord}</span>}
        </div>
        <div className="sports-score-num">{awayScore ?? '—'}</div>
        <div className="sports-score-divider">·</div>
        <div className="sports-score-num">{homeScore ?? '—'}</div>
        <div className="sports-score-team sports-score-team--home">
          <span>{homeTeam?.abbrev}</span>
          {showBox && homeRecord && <span className="sports-score-record">{homeRecord}</span>}
        </div>
      </div>

      {showBox && homeLinescores?.length > 0 && (
        <div className="sports-linescore-wrap">
          <table className="sports-linescore">
            <thead>
              <tr>
                <th></th>
                {quarters.map((q) => <th key={q}>{q}</th>)}
                <th className="col-totals">T</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{awayTeam?.abbrev}</td>
                {(awayLinescores || []).map((s, i) => <td key={i}>{s}</td>)}
                <td className="col-totals">{awayScore ?? '—'}</td>
              </tr>
              <tr>
                <td>{homeTeam?.abbrev}</td>
                {(homeLinescores || []).map((s, i) => <td key={i}>{s}</td>)}
                <td className="col-totals">{homeScore ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── NHL Panel ────────────────────────────────────────────────────────────────

const STRENGTH_LABEL = { pp: 'PP', sh: 'SH', ev: null };

function NhlPanel({ data, detail }) {
  const { status, homeTeam, awayTeam, homeScore, awayScore, period, periodType, lastPeriodType,
          periods, goals, homeShots, awayShots, homePP, awayPP, homeGoalie, awayGoalie, threeStars } = data;
  const showBox = detail === 'boxscore' || detail === 'all';
  const showAll = detail === 'all';
  const isLive   = status === 'LIVE' || status === 'CRIT';
  const isFinal  = status === 'OFF'  || status === 'FINAL';
  const finishSuffix = lastPeriodType === 'OT' ? '/OT' : lastPeriodType === 'SO' ? '/SO' : '';
  const statusLabel  = isFinal ? `Final${finishSuffix}` : status;

  return (
    <div>
      <div className="sports-panel-header">
        <StatusBadge sport="nhl" status={statusLabel} />
        {isLive && period && (
          <span style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)' }}>
            {periodType === 'OT' ? 'OT' : periodType === 'SO' ? 'SO' : `P${period}`}
          </span>
        )}
      </div>

      {/* Score row */}
      <div className="sports-score-row">
        <div className="sports-score-team sports-score-team--away">{awayTeam?.abbrev}</div>
        <div className="sports-score-num">{awayScore ?? '—'}</div>
        <div className="sports-score-divider">·</div>
        <div className="sports-score-num">{homeScore ?? '—'}</div>
        <div className="sports-score-team sports-score-team--home">{homeTeam?.abbrev}</div>
      </div>

      {/* Period linescore — box score+ */}
      {showBox && periods?.length > 0 && (
        <div className="sports-linescore-wrap">
          <table className="sports-linescore">
            <thead>
              <tr>
                <th></th>
                {periods.map((p) => <th key={p.periodDesc}>{p.periodDesc}</th>)}
                <th className="col-totals">T</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{awayTeam?.abbrev}</td>
                {periods.map((p) => <td key={p.periodDesc}>{p.away ?? '—'}</td>)}
                <td className="col-totals">{awayScore ?? '—'}</td>
              </tr>
              <tr>
                <td>{homeTeam?.abbrev}</td>
                {periods.map((p) => <td key={p.periodDesc}>{p.home ?? '—'}</td>)}
                <td className="col-totals">{homeScore ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Goal log — full detail only */}
      {showAll && goals?.length > 0 && (
        <div className="sports-nhl-goals">
          {goals.map((g, i) => (
            <div key={i} className="sports-nhl-goal-row">
              <span className="sports-nhl-goal-meta">
                {g.teamAbbrev} · {g.period} {g.timeInPeriod}
                {STRENGTH_LABEL[g.strength] && <span className="sports-nhl-strength">{STRENGTH_LABEL[g.strength]}</span>}
                {g.emptyNet && <span className="sports-nhl-strength">EN</span>}
              </span>
              <span className="sports-nhl-goal-scorer">
                {g.scorer}{g.scorerTotal != null ? ` (${g.scorerTotal})` : ''}
              </span>
              {g.assists?.length > 0 && (
                <span className="sports-nhl-goal-assists">{g.assists.join(', ')}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Team stats — box score+ */}
      {showBox && (homeShots != null || homePP) && (
        <div className="sports-decisions" style={{ marginTop: 8 }}>
          {homeShots != null && <span>SOG: {awayShots}–{homeShots}</span>}
          {homePP     && <span>PP: {awayPP} / {homePP}</span>}
        </div>
      )}

      {/* Goalie duel — full detail */}
      {showAll && (awayGoalie || homeGoalie) && (
        <div className="sports-nhl-goalies">
          {awayGoalie && (
            <div>{awayGoalie.decision ? `${awayGoalie.decision} · ` : ''}{awayGoalie.name} {awayGoalie.saves}/{awayGoalie.shots}{awayGoalie.savePct ? ` (${awayGoalie.savePct})` : ''}</div>
          )}
          {homeGoalie && (
            <div>{homeGoalie.decision ? `${homeGoalie.decision} · ` : ''}{homeGoalie.name} {homeGoalie.saves}/{homeGoalie.shots}{homeGoalie.savePct ? ` (${homeGoalie.savePct})` : ''}</div>
          )}
        </div>
      )}

      {/* Three Stars — full detail */}
      {showAll && threeStars?.length > 0 && (
        <div className="sports-nhl-goalies" style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          {threeStars.map((s) => (
            <div key={s.star}>⭐{'⭐'.repeat(s.star === 1 ? 2 : s.star === 2 ? 1 : 0)} {s.name}{s.teamAbbrev ? ` · ${s.teamAbbrev}` : ''}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Golf Panel ───────────────────────────────────────────────────────────────

function GolfPanel({ data, detail }) {
  const { tournamentName, status, currentRound, leaderboard, trackedGolfers, cutLine, espnUrl } = data;
  const hasRounds = leaderboard?.[0]?.rounds?.length > 1;
  const showBox = detail === 'boxscore' || detail === 'all';
  const showAll = detail === 'all';
  // Score: show leader only; boxscore: full leaderboard; all: leaderboard + tracked + cut
  const visibleLeaderboard = detail === 'score' ? leaderboard?.slice(0, 1) : leaderboard;

  return (
    <div>
      <div className="sports-panel-header">
        <StatusBadge sport="golf" status={status} />
        {currentRound && <span style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)' }}>Round {currentRound}</span>}
      </div>

      {tournamentName && (
        <div style={{ fontSize: 'var(--s-sm)', fontWeight: 600, marginBottom: 8 }}>{tournamentName}</div>
      )}

      <table className="sports-leaderboard">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Player</th>
            <th className="num">Score</th>
            <th className="num">Today</th>
            <th className="num">Thru</th>
            {hasRounds && leaderboard[0].rounds.map((_, i) => (
              <th key={i} className="num">R{i+1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(visibleLeaderboard || []).map((p, i) => (
            <tr key={i}>
              <td>{p.positionText}</td>
              <td>{p.name}</td>
              <td className="num">{p.score}</td>
              <td className="num">{p.today ?? '—'}</td>
              <td className="num">{p.thru}</td>
              {hasRounds && (p.rounds || []).map((r, ri) => <td key={ri} className="num">{r}</td>)}
            </tr>
          ))}

          {showAll && trackedGolfers?.length > 0 && (
            <>
              <tr className="sports-leaderboard-divider">
                <td colSpan={hasRounds ? 5 + (leaderboard[0]?.rounds?.length || 0) : 5}>── Tracked ──</td>
              </tr>
              {trackedGolfers.map((p, i) => (
                <tr key={`tracked-${i}`} className="tracked">
                  <td>{p.positionText}</td>
                  <td>{p.name}</td>
                  <td className="num">{p.score}</td>
                  <td className="num">{p.today ?? '—'}</td>
                  <td className="num">{p.thru}</td>
                  {hasRounds && (p.rounds || []).map((r, ri) => <td key={ri} className="num">{r}</td>)}
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>

      {showAll && cutLine && (
        <div className="sports-record">Cut: {cutLine}</div>
      )}

      {espnUrl && (
        <div style={{ marginTop: 8, textAlign: 'right' }}>
          <a
            href={espnUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)', textDecoration: 'none' }}
          >
            Full leaderboard ↗
          </a>
        </div>
      )}
    </div>
  );
}

// ── NASCAR Panel ─────────────────────────────────────────────────────────────

function NascarPanel({ data }) {
  const { raceName, status, results } = data;

  return (
    <div>
      <div className="sports-panel-header">
        <StatusBadge sport="nascar" status={status} />
      </div>

      {raceName && (
        <div style={{ fontSize: 'var(--s-sm)', fontWeight: 600, marginBottom: 8 }}>{raceName}</div>
      )}

      <div className="sports-f1-results">
        {(results || []).map((r, i) => (
          <div key={i} className="sports-f1-row">
            <span className="sports-f1-pos">{r.position}</span>
            <span className="sports-f1-driver">
              <strong>#{r.number}</strong> {r.name}
            </span>
            {r.laps && <span className="sports-f1-team">{r.laps} laps</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── F1 Panel ─────────────────────────────────────────────────────────────────

function F1Panel({ data }) {
  const { sessionType, circuitName, countryName, status, topResults } = data;

  return (
    <div>
      <div className="sports-panel-header">
        <StatusBadge sport="f1" status={status} />
        <span style={{ fontSize: 'var(--s-xs)', color: 'var(--text-muted)' }}>{sessionType}</span>
      </div>

      {(circuitName || countryName) && (
        <div style={{ fontSize: 'var(--s-sm)', fontWeight: 600, marginBottom: 8 }}>
          {circuitName}{countryName ? ` · ${countryName}` : ''}
        </div>
      )}

      <div className="sports-f1-results">
        {(topResults || []).map((r) => (
          <div key={r.position} className="sports-f1-row">
            <span className="sports-f1-pos">{r.position}</span>
            {r.teamColor && (
              <span
                className="sports-f1-team-dot"
                style={{ background: `#${r.teamColor}` }}
              />
            )}
            <span className="sports-f1-driver">
              <strong>{r.acronym}</strong> {r.name}
            </span>
            {r.team && <span className="sports-f1-team">{r.team}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main SportsPanel ─────────────────────────────────────────────────────────

export default function SportsPanel({ enrichment, detailLevel = 'all' }) {
  if (!enrichment) return null;
  const { sport, data } = enrichment;
  if (!data) return null;

  // detailLevel: 'score' | 'boxscore' | 'all'
  const detail = detailLevel || 'all';

  return (
    <div className="sports-panel">
      {sport === 'mlb'    && <MlbPanel    data={data} detail={detail} />}
      {sport === 'nfl'    && <NflPanel    data={data} detail={detail} />}
      {sport === 'nba'    && <NbaPanel    data={data} detail={detail} />}
      {sport === 'nhl'    && <NhlPanel    data={data} detail={detail} />}
      {sport === 'golf'   && <GolfPanel   data={data} detail={detail} />}
      {sport === 'f1'     && <F1Panel     data={data} detail={detail} />}
      {sport === 'nascar' && <NascarPanel data={data} detail={detail} />}
    </div>
  );
}
