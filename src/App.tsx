
import { useState } from 'react'
import './App.css'

type ActivityType = 'pee' | 'poop' | 'meal' | 'walk' | 'water'

type Activity = {
  id: string
  type: ActivityType
  time: number
  person: string
  duration?: number
  notes?: string
}

const activityLabels: Record<ActivityType, string> = {
  pee: 'Pee',
  poop: 'Poop',
  meal: 'Meal',
  walk: 'Walk',
  water: 'Water',
}

const icons: Record<ActivityType, string> = {
  pee: '💧',
  poop: '💩',
  meal: '🥣',
  walk: '🐾',
  water: '💧',
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function timeAgo(timestamp: number) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60000),
  )

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours < 24) {
    return remainingMinutes
      ? `${hours}h ${remainingMinutes}m ago`
      : `${hours}h ago`
  }

  return `${Math.floor(hours / 24)}d ago`
}

export default function App() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [person, setPerson] = useState('Me')
  const [walkStarted, setWalkStarted] = useState<number | null>(null)
  const [mealNotes, setMealNotes] = useState('')
  const [showMealInput, setShowMealInput] = useState(false)

  function logActivity(
    type: ActivityType,
    extra: Partial<Activity> = {},
  ) {
    const activity: Activity = {
      id: crypto.randomUUID(),
      type,
      time: Date.now(),
      person,
      ...extra,
    }

    setActivities((current) => [activity, ...current])
  }

  function logMeal() {
    logActivity('meal', {
      notes: mealNotes.trim() || 'Meal recorded',
    })
    setMealNotes('')
    setShowMealInput(false)
  }

  function startWalk() {
    setWalkStarted(Date.now())
  }

  function finishWalk() {
    if (walkStarted === null) return

    const duration = Math.max(
      1,
      Math.round((Date.now() - walkStarted) / 60000),
    )

    logActivity('walk', {
      time: walkStarted,
      duration,
      notes: `Finished at ${formatTime(Date.now())}`,
    })

    setWalkStarted(null)
  }

  function latest(type: ActivityType) {
    return activities.find((activity) => activity.type === type)
  }

  const todayActivities = activities.filter((activity) => {
    const date = new Date(activity.time)
    const now = new Date()

    return date.toDateString() === now.toDateString()
  })

  const walkMinutes = todayActivities
    .filter((activity) => activity.type === 'walk')
    .reduce((total, activity) => total + (activity.duration ?? 0), 0)

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">🐶</div>
          <div>
            <h1>SoliTrack</h1>
            <p>Better care, together.</p>
          </div>
        </div>
        <span className="status-pill">
          <span className="status-dot" />
          Local demo
        </span>
      </header>

      <section className="welcome">
        <p className="eyebrow">YOUR FAMILY'S DOG CARE</p>
        <h2>How's your best friend doing?</h2>
        <p className="subtitle">
          Every little detail helps everyone take better care.
        </p>

        <label className="person-select">
          <span>Logging as</span>
          <select
            value={person}
            onChange={(event) => setPerson(event.target.value)}
          >
            <option>Me</option>
            <option>Family member 2</option>
            <option>Family member 3</option>
            <option>Family member 4</option>
            <option>Family member 5</option>
          </select>
        </label>
      </section>

      <section className="summary-grid" aria-label="Latest activities">
        {(['pee', 'meal', 'walk', 'water'] as ActivityType[]).map((type) => {
          const activity = latest(type)

          return (
            <article className="summary-card" key={type}>
              <div className={`summary-icon ${type}`}>
                {icons[type]}
              </div>
              <p className="summary-label">Last {activityLabels[type].toLowerCase()}</p>
              <h3>
                {activity ? formatTime(activity.time) : 'Not yet'}
              </h3>
              <p className="summary-detail">
                {activity
                  ? type === 'walk'
                    ? `${activity.duration} min · ${activity.person}`
                    : `${timeAgo(activity.time)} · ${activity.person}`
                  : 'No activity logged'}
              </p>
            </article>
          )
        })}
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">QUICK ACTIONS</p>
            <h2>Log an activity</h2>
          </div>
          <span className="today-label">Today</span>
        </div>

        <div className="action-grid">
          <button
            className="action-card pee-action"
            onClick={() => logActivity('pee')}
          >
            <span className="action-icon">💧</span>
            <span className="action-title">Pee</span>
            <span className="action-description">Log potty break</span>
          </button>

          <button
            className="action-card poop-action"
            onClick={() => logActivity('poop')}
          >
            <span className="action-icon">💩</span>
            <span className="action-title">Poop</span>
            <span className="action-description">Log potty break</span>
          </button>

          <button
            className="action-card meal-action"
            onClick={() => setShowMealInput((visible) => !visible)}
          >
            <span className="action-icon">🥣</span>
            <span className="action-title">Meal</span>
            <span className="action-description">Record feeding</span>
          </button>

        <button
          className="action-card water-action"
          onClick={() => logActivity('water')}
        >
          <span className="action-icon">🥤</span>
          <span className="action-title">Water</span>
          <span className="action-description">Log drinking</span>
        </button>

          <button
            className={`action-card walk-action ${walkStarted !== null ? 'walking' : ''}`}
            onClick={walkStarted === null ? startWalk : finishWalk}
          >
            <span className="action-icon">🐾</span>
            <span className="action-title">
              {walkStarted === null ? 'Start walk' : 'Finish walk'}
            </span>
            <span className="action-description">
              {walkStarted === null
                ? 'Track duration'
                : `Started ${formatTime(walkStarted)}`}
            </span>
          </button>
        </div>

        {showMealInput && (
          <div className="meal-form">
            <label htmlFor="meal-notes">Meal details (optional)</label>
            <input
              id="meal-notes"
              value={mealNotes}
              onChange={(event) => setMealNotes(event.target.value)}
              placeholder="e.g. 150 g of dry food"
            />
            <div className="form-actions">
              <button
                className="text-button"
                onClick={() => setShowMealInput(false)}
              >
                Cancel
              </button>
              <button className="primary-button" onClick={logMeal}>
                Save meal
              </button>
            </div>
          </div>
        )}

        {walkStarted !== null && (
          <p className="walk-hint">
            Your walk is in progress. Finish it to save the duration.
          </p>
        )}
      </section>

      <section className="section history-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE DAILY LOG</p>
            <h2>Recent activity</h2>
          </div>
          <span className="count-pill">{todayActivities.length} events</span>
        </div>

        {activities.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🐕</span>
            <h3>Your story starts here</h3>
            <p>Log the first activity and it will appear here.</p>
          </div>
        ) : (
          <div className="activity-list">
            {activities.map((activity) => (
              <article className="activity-row" key={activity.id}>
                <div className={`activity-icon ${activity.type}`}>
                  {icons[activity.type]}
                </div>
                <div className="activity-info">
                  <h3>
                    {activityLabels[activity.type]}
                    {activity.type === 'walk' &&
                      ` · ${activity.duration} min`}
                  </h3>
                  <p>
                    {activity.notes && activity.type !== 'walk'
                      ? activity.notes
                      : activity.person}
                  </p>
                </div>
                <time className="activity-time">
                  {formatTime(activity.time)}
                </time>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="app-footer">
        <p>Made with ❤️ for your four-legged family member.</p>
        <p>Demo version · Data is not shared between devices yet.</p>
      </footer>
    </main>
  )
}
