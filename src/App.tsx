
import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'

type ActivityType = 'pee' | 'poop' | 'meal' | 'water' | 'walk'
type Tab = 'home' | 'calendar' | 'history' | 'photos'

type Activity = {
  id: string
  type: ActivityType
  time: number
  person: string
  amount?: number
  duration?: number
}

type StoredPhoto = {
  id: string
  name: string
  time: number
  blob: Blob
}

const STORAGE_KEY = 'soli-track-activities'
const FOOD_GOAL = 375
const PHOTO_DB_NAME = 'soli-track-photos'
const PHOTO_STORE_NAME = 'photos'

const PEOPLE = ['אבא', 'אמא', 'אודם', 'אגמון', 'אוריה']

const ACTIVITY_INFO: Record<
  ActivityType,
  { label: string; icon: string }
> = {
  pee: { label: 'Pee', icon: '💧' },
  poop: { label: 'Poop', icon: '💩' },
  meal: { label: 'Food', icon: '🍽️' },
  water: { label: 'Water', icon: '🚰' },
  walk: { label: 'Walk', icon: '🐕' },
}

function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(key: string): string {
  return dateFromKey(key).toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`
}

function loadActivities(): Activity[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? (JSON.parse(saved) as Activity[]) : []
  } catch {
    return []
  }
}

// IndexedDB helpers for saving image files in the browser.

function openPhotoDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported by this browser.'))
      return
    }

    const request = indexedDB.open(PHOTO_DB_NAME, 1)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(PHOTO_STORE_NAME)) {
        database.createObjectStore(PHOTO_STORE_NAME, {
          keyPath: 'id',
        })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open photo storage.'))
  })
}

async function getSavedPhotos(): Promise<StoredPhoto[]> {
  const database = await openPhotoDatabase()

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(
        PHOTO_STORE_NAME,
        'readonly',
      )
      const request = transaction
        .objectStore(PHOTO_STORE_NAME)
        .getAll()

      request.onsuccess = () => {
        const photos = (request.result as StoredPhoto[]).sort(
          (a, b) => b.time - a.time,
        )
        resolve(photos)
      }

      request.onerror = () =>
        reject(request.error ?? new Error('Could not load photos.'))
    })
  } finally {
    database.close()
  }
}

async function savePhoto(photo: StoredPhoto): Promise<void> {
  const database = await openPhotoDatabase()

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        PHOTO_STORE_NAME,
        'readwrite',
      )

      transaction.objectStore(PHOTO_STORE_NAME).add(photo)

      transaction.oncomplete = () => resolve()
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not save photo.'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Saving photo was cancelled.'))
    })
  } finally {
    database.close()
  }
}

async function removeSavedPhoto(id: string): Promise<void> {
  const database = await openPhotoDatabase()

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        PHOTO_STORE_NAME,
        'readwrite',
      )

      transaction.objectStore(PHOTO_STORE_NAME).delete(id)

      transaction.oncomplete = () => resolve()
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not delete photo.'))
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Deleting photo was cancelled.'))
    })
  } finally {
    database.close()
  }
}

function PhotoCard({
  photo,
  onDelete,
}: {
  photo: StoredPhoto
  onDelete: (photo: StoredPhoto) => void
}) {
  const [imageUrl, setImageUrl] = useState('')

  useEffect(() => {
    const url = URL.createObjectURL(photo.blob)
    setImageUrl(url)

    return () => URL.revokeObjectURL(url)
  }, [photo.blob])

  return (
    <article className="photo-card">
      {imageUrl ? (
        <img
          className="photo-image"
          src={imageUrl}
          alt={photo.name}
          loading="lazy"
        />
      ) : (
        <div className="photo-image photo-image-placeholder">
          Loading photo…
        </div>
      )}

      <div className="photo-card-info">
        <p className="photo-name" title={photo.name}>
          {photo.name}
        </p>
        <p className="photo-date">
          {new Date(photo.time).toLocaleDateString([], {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </p>

        <button
          className="delete-photo-button"
          type="button"
          onClick={() => onDelete(photo)}
        >
          <span aria-hidden="true">🗑️</span> Delete
        </button>
      </div>
    </article>
  )
}

function App() {
  const [activities, setActivities] = useState<Activity[]>(loadActivities)
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [person, setPerson] = useState('אודם')

  const [mealGrams, setMealGrams] = useState('125')
  const [waterMl, setWaterMl] = useState('250')
  const [showMealInput, setShowMealInput] = useState(false)
  const [showWaterInput, setShowWaterInput] = useState(false)
  const [walkStarted, setWalkStarted] = useState<number | null>(null)

  const [photos, setPhotos] = useState<StoredPhoto[]>([])
  const [photosLoading, setPhotosLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState('')

  const today = dateKey(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activities))
    } catch {
      console.error('Could not save Soli Track activities.')
    }
  }, [activities])

  useEffect(() => {
    let cancelled = false

    getSavedPhotos()
      .then((savedPhotos) => {
        if (!cancelled) {
          setPhotos(savedPhotos)
          setPhotoError('')
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPhotoError(
            error instanceof Error
              ? error.message
              : 'Could not load photos.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setPhotosLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  function logActivity(
    type: ActivityType,
    extra: { amount?: number; duration?: number } = {},
    timestamp = Date.now(),
  ) {
    const activity: Activity = {
      id: `${timestamp}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      time: timestamp,
      person,
      ...extra,
    }

    setActivities((previous) => [activity, ...previous])
  }

  function logMeal() {
    const amount = Number(mealGrams)
    if (!Number.isFinite(amount) || amount <= 0) return

    logActivity('meal', { amount })
    setShowMealInput(false)
    setMealGrams('125')
  }

  function logWater() {
    const amount = Number(waterMl)
    if (!Number.isFinite(amount) || amount <= 0) return

    logActivity('water', { amount })
    setShowWaterInput(false)
    setWaterMl('250')
  }

  function finishWalk() {
    if (walkStarted === null) return

    const duration = Math.max(
      1,
      Math.round((Date.now() - walkStarted) / 60000),
    )

    logActivity('walk', { duration }, walkStarted)
    setWalkStarted(null)
  }

  async function handlePhotoUpload(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget
    const files = Array.from(input.files ?? [])
    input.value = ''

    if (files.length === 0) return

    setUploading(true)
    setPhotoError('')

    try {
      const addedPhotos: StoredPhoto[] = []

      for (const file of files) {
        if (!file.type.startsWith('image/')) continue

        const photo: StoredPhoto = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          name: file.name,
          time: Date.now(),
          blob: file,
        }

        await savePhoto(photo)
        addedPhotos.push(photo)
      }

      setPhotos((previous) =>
        [...addedPhotos, ...previous].sort((a, b) => b.time - a.time),
      )

      if (addedPhotos.length === 0) {
        setPhotoError('Please select valid image files.')
      }
    } catch (error) {
      setPhotoError(
        error instanceof Error
          ? `Could not save photos: ${error.message}`
          : 'Could not save the selected photos.',
      )

      // Reload the gallery in case some files were saved before an error.
      try {
        setPhotos(await getSavedPhotos())
      } catch {
        // Keep the original error visible.
      }
    } finally {
      setUploading(false)
    }
  }

  async function deletePhoto(photo: StoredPhoto) {
    const confirmed = window.confirm(
      `Delete "${photo.name}" from Soli's gallery? This cannot be undone.`,
    )

    if (!confirmed) return

    setPhotoError('')

    try {
      await removeSavedPhoto(photo.id)
      setPhotos((previous) =>
        previous.filter((item) => item.id !== photo.id),
      )
    } catch (error) {
      setPhotoError(
        error instanceof Error
          ? `Could not delete photo: ${error.message}`
          : 'Could not delete this photo.',
      )
    }
  }

  const todayActivities = activities.filter(
    (activity) => dateKey(new Date(activity.time)) === today,
  )

  const selectedActivities = activities.filter(
    (activity) => dateKey(new Date(activity.time)) === selectedDate,
  )

  const foodTotal = todayActivities
    .filter((activity) => activity.type === 'meal')
    .reduce((sum, activity) => sum + (activity.amount ?? 0), 0)

  const foodProgress = Math.min(100, (foodTotal / FOOD_GOAL) * 100)

  function getTotal(type: ActivityType, list: Activity[]) {
    const matching = list.filter((activity) => activity.type === type)

    if (type === 'meal' || type === 'water') {
      return matching.reduce(
        (sum, activity) => sum + (activity.amount ?? 0),
        0,
      )
    }

    if (type === 'walk') {
      return matching.reduce(
        (sum, activity) => sum + (activity.duration ?? 0),
        0,
      )
    }

    return matching.length
  }

  function getTotalLabel(type: ActivityType, list: Activity[]) {
    const total = getTotal(type, list)

    if (type === 'meal') return `${total} g`
    if (type === 'water') return `${total} ml`
    if (type === 'walk') return formatDuration(total)
    return `${total} ${total === 1 ? 'time' : 'times'}`
  }

  function getLatest(type: ActivityType, list: Activity[]) {
    return list
      .filter((activity) => activity.type === type)
      .sort((a, b) => b.time - a.time)[0]
  }

  const sortedSelectedActivities = [...selectedActivities].sort(
    (a, b) => b.time - a.time,
  )

  const sortedAllActivities = [...activities].sort(
    (a, b) => b.time - a.time,
  )

  const monthYear = visibleMonth.toLocaleDateString([], {
    month: 'long',
    year: 'numeric',
  })

  // Monday-first calendar.
  const firstDay = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth(),
    1,
  )
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate()

  const calendarCells: (number | null)[] = [
    ...Array.from({ length: mondayOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]

  while (calendarCells.length % 7 !== 0) {
    calendarCells.push(null)
  }

  function changeMonth(amount: number) {
    setVisibleMonth(
      (previous) =>
        new Date(
          previous.getFullYear(),
          previous.getMonth() + amount,
          1,
        ),
    )
  }

  function chooseDay(day: number) {
    const chosen = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      day,
    )
    setSelectedDate(dateKey(chosen))
  }

  function renderActivityRow(activity: Activity) {
    const info = ACTIVITY_INFO[activity.type]
    let detail = ''

    if (activity.type === 'meal') {
      detail = `${activity.amount ?? 0} g`
    } else if (activity.type === 'water') {
      detail = `${activity.amount ?? 0} ml`
    } else if (activity.type === 'walk') {
      detail = formatDuration(activity.duration ?? 0)
    }

    return (
      <article className="activity-row" key={activity.id}>
        <div className={`activity-icon ${activity.type}`}>
          {info.icon}
        </div>

        <div className="activity-info">
          <h3>{info.label}</h3>
          <p>
            {formatTime(activity.time)}
            {detail ? ` · ${detail}` : ''}
          </p>
        </div>

        <div className="activity-person">{activity.person}</div>
      </article>
    )
  }

  function renderDailySummary(list: Activity[]) {
    const types: ActivityType[] = [
      'pee',
      'poop',
      'meal',
      'water',
      'walk',
    ]

    return (
      <div className="daily-summary">
        {types.map((type) => {
          const latest = getLatest(type, list)

          return (
            <article className="activity-row summary-row" key={type}>
              <div className={`activity-icon ${type}`}>
                {ACTIVITY_INFO[type].icon}
              </div>

              <div className="activity-info">
                <h3>{ACTIVITY_INFO[type].label}</h3>
                <p>{getTotalLabel(type, list)}</p>
              </div>

              <div className="last-recorded">
                <span>Last recorded</span>
                <strong>
                  {latest ? formatTime(latest.time) : '—'}
                </strong>
              </div>
            </article>
          )
        })}
      </div>
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">🐾</div>
          <div>
            <h1>Soli Track</h1>
            <p>Your dog's daily care companion</p>
          </div>
        </div>

        <label className="person-picker">
          <span>Logged by</span>
          <select
            value={person}
            onChange={(event) => setPerson(event.target.value)}
          >
            {PEOPLE.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <nav className="tab-bar" aria-label="Main navigation">
        <button
          className={activeTab === 'home' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('home')}
        >
          <span>🏠</span> Home
        </button>

        <button
          className={activeTab === 'history' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('history')}
        >
          <span>📋</span> History
        </button>

        <button
          className={activeTab === 'photos' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('photos')}
        >
          <span>📷</span> Photos
        </button>

        <button
          className={activeTab === 'calendar' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('calendar')}
        >
          <span>📅</span> Calendar
        </button>
      </nav>

      {activeTab === 'home' && (
        <section className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR DAILY DASHBOARD</p>
              <h2>Hi, {person}! 🐶</h2>
              <p className="muted">Here’s how your day is going.</p>
            </div>

            <div className="today-pill">
              {new Date().toLocaleDateString([], {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </div>
          </div>

          <section className="food-goal-card">
            <div className="food-goal-top">
              <div>
                <p className="eyebrow">DAILY FOOD GOAL</p>
                <h3>{foodTotal} / {FOOD_GOAL} g</h3>
                <p className="muted">
                  {Math.max(0, FOOD_GOAL - foodTotal)} g remaining
                </p>
              </div>
              <div className="food-emoji">🍽️</div>
            </div>

            <div
              className="progress-track"
              role="progressbar"
              aria-valuenow={Math.round(foodProgress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="progress-fill"
                style={{ width: `${foodProgress}%` }}
              />
            </div>

            <p className="progress-caption">
              {Math.round(foodProgress)}% of daily goal
            </p>
          </section>

          <section className="content-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">DAILY OVERVIEW</p>
                <h2>Today's activity</h2>
              </div>

              <button
                className="text-button"
                onClick={() => {
                  setSelectedDate(today)
                  setVisibleMonth(new Date())
                  setActiveTab('calendar')
                }}
              >
                View calendar →
              </button>
            </div>

            {renderDailySummary(todayActivities)}
          </section>

          <section className="content-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">QUICK ACTIONS</p>
                <h2>Log an activity</h2>
              </div>
            </div>

            <div className="action-grid">
              <button
                className="action-button pee-action"
                onClick={() => logActivity('pee')}
              >
                <span>💧</span>
                <strong>Pee</strong>
                <small>Log pee</small>
              </button>

              <button
                className="action-button poop-action"
                onClick={() => logActivity('poop')}
              >
                <span>💩</span>
                <strong>Poop</strong>
                <small>Log poop</small>
              </button>

              <button
                className="action-button meal-action"
                onClick={() => setShowMealInput(!showMealInput)}
              >
                <span>🍽️</span>
                <strong>Food</strong>
                <small>Add a meal</small>
              </button>

              <button
                className="action-button water-action"
                onClick={() => setShowWaterInput(!showWaterInput)}
              >
                <span>🚰</span>
                <strong>Water</strong>
                <small>Log water</small>
              </button>

              <button
                className="action-button walk-action"
                onClick={() =>
                  walkStarted === null
                    ? setWalkStarted(Date.now())
                    : finishWalk()
                }
              >
                <span>🐕</span>
                <strong>
                  {walkStarted === null ? 'Walk' : 'Finish walk'}
                </strong>
                <small>
                  {walkStarted === null
                    ? 'Start a walk'
                    : 'Save duration'}
                </small>
              </button>
            </div>

            {walkStarted !== null && (
              <p className="form-note">
                🐾 Walk in progress — started at {formatTime(walkStarted)}.
                Press “Finish walk” when you're back.
              </p>
            )}

            {showMealInput && (
              <form
                className="inline-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  logMeal()
                }}
              >
                <label htmlFor="meal-grams">Food amount (grams)</label>
                <div className="form-controls">
                  <input
                    id="meal-grams"
                    type="number"
                    min="1"
                    value={mealGrams}
                    onChange={(event) => setMealGrams(event.target.value)}
                    required
                  />
                  <button type="submit" className="primary-button">
                    Save meal
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowMealInput(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {showWaterInput && (
              <form
                className="inline-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  logWater()
                }}
              >
                <label htmlFor="water-ml">Water amount (ml)</label>
                <div className="form-controls">
                  <input
                    id="water-ml"
                    type="number"
                    min="1"
                    value={waterMl}
                    onChange={(event) => setWaterMl(event.target.value)}
                    required
                  />
                  <button type="submit" className="primary-button">
                    Save water
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowWaterInput(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="content-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">LATEST ENTRIES</p>
                <h2>Recent activity</h2>
              </div>

              <button
                className="text-button"
                onClick={() => setActiveTab('history')}
              >
                See all →
              </button>
            </div>

            {activities.length === 0 ? (
              <p className="empty-state">
                No activities logged yet. Start with a quick action above!
              </p>
            ) : (
              <div className="activity-list">
                {sortedAllActivities.slice(0, 5).map(renderActivityRow)}
              </div>
            )}
          </section>
        </section>
      )}

      {activeTab === 'calendar' && (
        <section className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">EXPLORE THE PAST</p>
              <h2>Activity calendar</h2>
              <p className="muted">
                Select any date to see Soli's daily totals.
              </p>
            </div>
          </div>

          <section className="content-card calendar-card">
            <div className="calendar-heading">
              <button
                className="calendar-nav"
                onClick={() => changeMonth(-1)}
                aria-label="Previous month"
              >
                ←
              </button>
              <h2>{monthYear}</h2>
              <button
                className="calendar-nav"
                onClick={() => changeMonth(1)}
                aria-label="Next month"
              >
                →
              </button>
            </div>

            <button
              className="text-button today-button"
              onClick={() => {
                const now = new Date()
                setSelectedDate(dateKey(now))
                setVisibleMonth(
                  new Date(now.getFullYear(), now.getMonth(), 1),
                )
              }}
            >
              Go to today
            </button>

            <div className="calendar-grid">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(
                (day) => (
                  <div className="calendar-weekday" key={day}>
                    {day}
                  </div>
                ),
              )}

              {calendarCells.map((day, index) => {
                if (day === null) {
                  return (
                    <div
                      className="calendar-empty"
                      key={`empty-${index}`}
                    />
                  )
                }

                const date = new Date(
                  visibleMonth.getFullYear(),
                  visibleMonth.getMonth(),
                  day,
                )
                const key = dateKey(date)
                const hasActivities = activities.some(
                  (activity) => dateKey(new Date(activity.time)) === key,
                )

                const isSelected = selectedDate === key
                const isToday = today === key

                return (
                  <button
                    className={[
                      'calendar-day',
                      isSelected ? 'selected' : '',
                      isToday ? 'is-today' : '',
                      hasActivities ? 'has-activities' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={key}
                    onClick={() => chooseDay(day)}
                    aria-pressed={isSelected}
                    aria-label={`${key}${hasActivities ? ', has activities' : ''}`}
                  >
                    <span>{day}</span>
                    {hasActivities && <span className="activity-dot" />}
                  </button>
                )
              })}
            </div>

            <div className="calendar-legend">
              <span className="activity-dot" />
              <span>Day with recorded activities</span>
            </div>
          </section>

          <section className="content-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">DAILY REPORT</p>
                <h2>{formatDate(selectedDate)}</h2>
              </div>
            </div>

            <div className="totals-grid">
              {(
                ['pee', 'poop', 'meal', 'water', 'walk'] as ActivityType[]
              ).map((type) => (
                <article className="total-card" key={type}>
                  <span className="total-icon">
                    {ACTIVITY_INFO[type].icon}
                  </span>
                  <span className="total-label">
                    {ACTIVITY_INFO[type].label}
                  </span>
                  <strong>
                    {getTotalLabel(type, selectedActivities)}
                  </strong>
                </article>
              ))}
            </div>

            {selectedDate === today && (
              <div className="selected-food-goal">
                <div className="food-goal-top">
                  <span>🍽️ Daily food goal</span>
                  <strong>
                    {getTotal('meal', selectedActivities)} / {FOOD_GOAL} g
                  </strong>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        (getTotal('meal', selectedActivities) / FOOD_GOAL) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="section-subheading">
              <h3>Entries for this day</h3>
              <span>{selectedActivities.length} entries</span>
            </div>

            {sortedSelectedActivities.length === 0 ? (
              <p className="empty-state">
                No activities recorded for this date.
              </p>
            ) : (
              <div className="activity-list">
                {sortedSelectedActivities.map(renderActivityRow)}
              </div>
            )}
          </section>
        </section>
      )}

      {activeTab === 'history' && (
        <section className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">EVERYTHING IN ONE PLACE</p>
              <h2>Activity history</h2>
              <p className="muted">
                All of Soli's recorded activities, newest first.
              </p>
            </div>
          </div>

          <section className="content-card">
            <div className="section-heading">
              <div>
                <h2>All entries</h2>
                <p className="muted">{activities.length} total entries</p>
              </div>
            </div>

            {sortedAllActivities.length === 0 ? (
              <p className="empty-state">
                Nothing here yet. Activities you log will appear here.
              </p>
            ) : (
              <div className="activity-list">
                {sortedAllActivities.map((activity) => (
                  <div key={activity.id}>
                    <p className="history-date">
                      {formatDate(dateKey(new Date(activity.time)))}
                    </p>
                    {renderActivityRow(activity)}
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      )}

      {activeTab === 'photos' && (
        <section className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">SOLI'S PERSONAL ALBUM</p>
              <h2>Photo gallery 📸</h2>
              <p className="muted">
                Keep your favorite moments together.
              </p>
            </div>
          </div>

          <section className="content-card photo-upload-card">
            <div className="photo-upload-icon">🐶</div>
            <h3>Add photos of Soli</h3>
            <p className="muted">
              Choose one or more images from your device.
            </p>

            <label
              className={`upload-button ${uploading ? 'uploading' : ''}`}
            >
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={uploading}
                onChange={handlePhotoUpload}
              />
              <span aria-hidden="true">＋</span>
              {uploading ? 'Uploading photos…' : 'Choose photos'}
            </label>

            <p className="storage-note">
              Photos are saved in this browser on this device.
            </p>
          </section>

          {photoError && (
            <div className="photo-error" role="alert">
              {photoError}
            </div>
          )}

          <section className="content-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">YOUR COLLECTION</p>
                <h2>All photos</h2>
              </div>
              <span className="photo-count">
                {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
              </span>
            </div>

            {photosLoading ? (
              <p className="empty-state">Loading your photos…</p>
            ) : photos.length === 0 ? (
              <div className="empty-photos">
                <div>📷</div>
                <h3>Your gallery is waiting</h3>
                <p>
                  Upload your first photo of Soli and it will appear here.
                </p>
              </div>
            ) : (
              <div className="photo-grid">
                {photos.map((photo) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    onDelete={deletePhoto}
                  />
                ))}
              </div>
            )}
          </section>
        </section>
      )}

      <footer className="app-footer">Made with ❤️ for Soli</footer>
    </main>
  )
}

export default App