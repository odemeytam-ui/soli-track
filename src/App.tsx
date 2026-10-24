import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import './App.css'

type ActivityType = 'pee' | 'poop' | 'meal' | 'water' | 'walk'
type Tab = 'home' | 'calendar' | 'insights' | 'photos' | 'settings'
type MealSlot = 'breakfast' | 'lunch' | 'dinner'

type Activity = {
  id: string
  type: ActivityType
  time: number
  person: string
  amount?: number
  duration?: number
  notes?: string
  mealSlot?: MealSlot
}

type StoredPhoto = {
  id: string
  name: string
  time: number
  blob: Blob
}

type MedicalReport = {
  id: string
  title: string
  category: string
  date: string
  notes: string
  person: string
  createdAt: number
}

const STORAGE_KEY = 'soli-track-activities'
const MEDICAL_STORAGE_KEY = 'soli-track-medical-reports'
const REMINDER_STORAGE_KEY = 'soli-track-dismissed-meal-reminders'
const CELEBRATION_STORAGE_KEY = 'soli-track-daily-celebration'
const FOOD_GOAL = 375
const PHOTO_DB_NAME = 'soli-track-photos'
const PHOTO_STORE_NAME = 'photos'

const DEFAULT_PEOPLE = ['אבא', 'אמא', 'אודם', 'אגמון', 'אוריה']
const SETTINGS_STORAGE_KEY = 'soli-track-settings'
const PEOPLE_STORAGE_KEY = 'soli-track-caregivers'
type AppSettings = {
  petName: string
  age: string
  weight: string
  mealsPerDay: number
  dailyFoodGoal: number
  foodType: string
  mealTimes: string[]
}
const DEFAULT_SETTINGS: AppSettings = {
  petName: 'Soli',
  age: '',
  weight: '',
  mealsPerDay: 3,
  dailyFoodGoal: 375,
  foodType: '',
  mealTimes: ['08:00', '14:30', '19:30'],
}

const ACTIVITY_INFO: Record<ActivityType, { label: string; icon: string }> = {
  pee: { label: 'Pee', icon: '💧' },
  poop: { label: 'Poop', icon: '💩' },
  meal: { label: 'Food', icon: '🍽️' },
  water: { label: 'Water', icon: '🚰' },
  walk: { label: 'Walk', icon: '🐕' },
}

const MEAL_SLOTS: {
  id: MealSlot
  label: string
  deadline: number
  defaultAmount: number
}[] = [
  { id: 'breakfast', label: 'Breakfast', deadline: 8 * 60, defaultAmount: 125 },
  { id: 'lunch', label: 'Lunch', deadline: 14 * 60 + 30, defaultAmount: 125 },
  { id: 'dinner', label: 'Dinner', deadline: 19 * 60 + 30, defaultAmount: 125 },
]

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

function toLocalDateTimeValue(timestamp: number): string {
  const date = new Date(timestamp)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 16)
}

function getMealSlotForTime(timestamp: number): MealSlot {
  const date = new Date(timestamp)
  const minutes = date.getHours() * 60 + date.getMinutes()
  if (minutes < 11 * 60) return 'breakfast'
  if (minutes < 17 * 60) return 'lunch'
  return 'dinner'
}

function loadActivities(): Activity[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? (JSON.parse(saved) as Activity[]) : []
  } catch {
    return []
  }
}

function loadMedicalReports(): MedicalReport[] {
  try {
    const saved = localStorage.getItem(MEDICAL_STORAGE_KEY)
    return saved ? (JSON.parse(saved) as MedicalReport[]) : []
  } catch {
    return []
  }
}

function loadDismissedReminders(): string[] {
  try {
    return JSON.parse(
      localStorage.getItem(REMINDER_STORAGE_KEY) ?? '[]',
    ) as string[]
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
        database.createObjectStore(PHOTO_STORE_NAME, { keyPath: 'id' })
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
      const transaction = database.transaction(PHOTO_STORE_NAME, 'readonly')
      const request = transaction.objectStore(PHOTO_STORE_NAME).getAll()

      request.onsuccess = () => {
        const saved = (request.result as StoredPhoto[]).sort(
          (a, b) => b.time - a.time,
        )
        resolve(saved)
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
      const transaction = database.transaction(PHOTO_STORE_NAME, 'readwrite')
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
      const transaction = database.transaction(PHOTO_STORE_NAME, 'readwrite')
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
        <p className="photo-name" title={photo.name}>{photo.name}</p>
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
  const [medicalReports, setMedicalReports] =
    useState<MedicalReport[]>(loadMedicalReports)
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [people, setPeople] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(PEOPLE_STORAGE_KEY) ?? 'null') ?? DEFAULT_PEOPLE
    } catch {
      return DEFAULT_PEOPLE
    }
  })
  const [person, setPerson] = useState('אודם')
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}') }
    } catch {
      return DEFAULT_SETTINGS
    }
  })
  const [newCaregiver, setNewCaregiver] = useState('')
  const [showCaregiverModal, setShowCaregiverModal] = useState(false)
  const [showCelebrationPopup, setShowCelebrationPopup] = useState(false)

  const [mealGrams, setMealGrams] = useState('125')
  const [waterMl, setWaterMl] = useState('250')
  const [showMealInput, setShowMealInput] = useState(false)
  const [showWaterInput, setShowWaterInput] = useState(false)
  const [walkStarted, setWalkStarted] = useState<number | null>(null)

  const [photos, setPhotos] = useState<StoredPhoto[]>([])
  const [photosLoading, setPhotosLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState('')

  // New: plus menu, manual activity form and medical report form.
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [showActivityModal, setShowActivityModal] = useState(false)
  const [showMedicalModal, setShowMedicalModal] = useState(false)
  const [manualType, setManualType] = useState<ActivityType>('pee')
  const [manualTime, setManualTime] = useState(() =>
    toLocalDateTimeValue(Date.now()),
  )
  const [manualAmount, setManualAmount] = useState('125')
  const [manualDuration, setManualDuration] = useState('30')
  const [manualNotes, setManualNotes] = useState('')
  const [manualMealSlot, setManualMealSlot] =
    useState<MealSlot>('breakfast')

  const [medicalTitle, setMedicalTitle] = useState('')
  const [medicalCategory, setMedicalCategory] = useState('Vet visit')
  const [medicalDate, setMedicalDate] = useState(dateKey(new Date()))
  const [medicalNotes, setMedicalNotes] = useState('')

  const [dismissedReminders, setDismissedReminders] =
    useState<string[]>(loadDismissedReminders)
  const [clockNow, setClockNow] = useState(Date.now())
  const [celebration, setCelebration] = useState<{
    date: string
    winners: string[]
    count: number
  } | null>(null)

  const today = dateKey(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  useEffect(() => {
    try { localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(people)) } catch { console.error('Could not save caregivers.') }
  }, [people])

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)) } catch { console.error('Could not save settings.') }
  }, [settings])

  useEffect(() => {
    if (people.length && !people.includes(person)) setPerson(people[0])
  }, [people, person])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activities))
    } catch {
      console.error('Could not save Soli Track activities.')
    }
  }, [activities])

  useEffect(() => {
    try {
      localStorage.setItem(
        MEDICAL_STORAGE_KEY,
        JSON.stringify(medicalReports),
      )
    } catch {
      console.error('Could not save Soli Track medical reports.')
    }
  }, [medicalReports])

  useEffect(() => {
    try {
      localStorage.setItem(
        REMINDER_STORAGE_KEY,
        JSON.stringify(dismissedReminders),
      )
    } catch {
      console.error('Could not save reminder settings.')
    }
  }, [dismissedReminders])

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
            error instanceof Error ? error.message : 'Could not load photos.',
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

  // Update the clock while the app is open, so reminders and the
  // end-of-day celebration can activate without refreshing the page.
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [])

  function logActivity(
    type: ActivityType,
    extra: {
      amount?: number
      duration?: number
      notes?: string
      mealSlot?: MealSlot
    } = {},
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

  function openActivityLogger(
    type: ActivityType = 'pee',
    slot?: MealSlot,
  ) {
    setManualType(type)
    setManualTime(toLocalDateTimeValue(Date.now()))
    setManualAmount(
      type === 'water' ? '250' : type === 'meal' ? '125' : '',
    )
    setManualDuration('30')
    setManualNotes('')
    if (slot) setManualMealSlot(slot)
    else setManualMealSlot(getMealSlotForTime(Date.now()))
    setShowPlusMenu(false)
    setShowActivityModal(true)
  }

  function logMeal() {
    const amount = Number(mealGrams)
    if (!Number.isFinite(amount) || amount <= 0) return

    const timestamp = Date.now()
    logActivity('meal', {
      amount,
      mealSlot: getMealSlotForTime(timestamp),
    }, timestamp)
    setShowMealInput(false)
    setMealGrams('125')
  }

  function logWater() {
    const amount = Number(waterMl)
    if (!Number.isFinite(amount) || amount <= 0) return

    logActivity('water', {
      amount,
      notes: `${amount} ml of water given`,
    })
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

  function saveManualActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const timestamp = new Date(manualTime).getTime()
    if (!Number.isFinite(timestamp)) return

    const extra: {
      amount?: number
      duration?: number
      notes?: string
      mealSlot?: MealSlot
    } = {}

    if (manualType === 'meal' || manualType === 'water') {
      const amount = Number(manualAmount)
      if (!Number.isFinite(amount) || amount <= 0) return
      extra.amount = amount
    }

    if (manualType === 'walk') {
      const duration = Number(manualDuration)
      if (!Number.isFinite(duration) || duration <= 0) return
      extra.duration = duration
    }

    if (manualNotes.trim()) extra.notes = manualNotes.trim()

    if (manualType === 'meal') {
      extra.mealSlot = manualMealSlot
    }

    logActivity(manualType, extra, timestamp)
    setShowActivityModal(false)
  }

  function saveMedicalReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!medicalTitle.trim() || !medicalDate) return

    const report: MedicalReport = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title: medicalTitle.trim(),
      category: medicalCategory,
      date: medicalDate,
      notes: medicalNotes.trim(),
      person,
      createdAt: Date.now(),
    }

    setMedicalReports((previous) =>
      [report, ...previous].sort((a, b) => b.date.localeCompare(a.date)),
    )
    setMedicalTitle('')
    setMedicalCategory('Vet visit')
    setMedicalDate(dateKey(new Date()))
    setMedicalNotes('')
    setShowMedicalModal(false)
  }

  function deleteMedicalReport(report: MedicalReport) {
    const confirmed = window.confirm(
      `Delete the medical report "${report.title}"? This cannot be undone.`,
    )
    if (!confirmed) return
    setMedicalReports((previous) =>
      previous.filter((item) => item.id !== report.id),
    )
  }

  function dismissMealReminder(slot: MealSlot) {
    setDismissedReminders((previous) => {
      const key = `${today}:${slot}`
      return previous.includes(key) ? previous : [...previous, key]
    })
  }

  async function handlePhotoUpload(event: ChangeEvent<HTMLInputElement>) {
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
      `Delete "${photo.name}" from ${(settings.petName || 'Soli')}'s gallery? This cannot be undone.`,
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

  const foodGoal = Math.max(1, Number(settings.dailyFoodGoal) || FOOD_GOAL)
  const foodProgress = Math.min(100, (foodTotal / foodGoal) * 100)

  function getTotal(type: ActivityType, list: Activity[]) {
    const matching = list.filter((activity) => activity.type === type)

    if (type === 'meal' || type === 'water') {
      return matching.reduce((sum, activity) => sum + (activity.amount ?? 0), 0)
    }

    if (type === 'walk') {
      return matching.reduce((sum, activity) => sum + (activity.duration ?? 0), 0)
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

  const sortedAllActivities = [...activities].sort((a, b) => b.time - a.time)
  const monthYear = visibleMonth.toLocaleDateString([], {
    month: 'long',
    year: 'numeric',
  })

  // Meal slot detection supports older meal entries that don't have mealSlot.
  function hasLoggedMealSlot(slot: MealSlot) {
    return todayActivities.some((activity) => {
      if (activity.type !== 'meal') return false
      return (activity.mealSlot ?? getMealSlotForTime(activity.time)) === slot
    })
  }

  const currentDate = new Date(clockNow)
  const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes()

  const configuredMealSlots = MEAL_SLOTS.slice(0, Math.max(1, Math.min(3, settings.mealsPerDay))).map((slot, index) => {
    const [hours, minutes] = (settings.mealTimes[index] ?? ['08:00', '14:30', '19:30'][index]).split(':').map(Number)
    return { ...slot, deadline: (hours || 0) * 60 + (minutes || 0) }
  })

  const overdueMealSlots = configuredMealSlots.filter((slot) => {
    const reminderKey = `${today}:${slot.id}`
    return (
      currentMinutes >= slot.deadline &&
      !hasLoggedMealSlot(slot.id) &&
      !dismissedReminders.includes(reminderKey)
    )
  })

  // At 23:00, calculate who logged the most activities today.
  useEffect(() => {
    const now = new Date(clockNow)
    if (now.getHours() < 23) return

    const day = dateKey(now)
    try {
      if (localStorage.getItem(CELEBRATION_STORAGE_KEY) === day) return
    } catch {
      // Continue if localStorage is unavailable.
    }

    const counts = people.map((name) => ({
      name,
      count: activities.filter(
        (activity) =>
          activity.person === name &&
          dateKey(new Date(activity.time)) === day,
      ).length,
    }))
    const highest = Math.max(...counts.map((entry) => entry.count))
    if (highest === 0) return

    const winners = counts
      .filter((entry) => entry.count === highest)
      .map((entry) => entry.name)

    setCelebration({ date: day, winners, count: highest })
    setShowCelebrationPopup(true)

    try {
      localStorage.setItem(CELEBRATION_STORAGE_KEY, day)
    } catch {
      // Celebration still works for this open session.
    }
  }, [clockNow, activities, people])

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

  while (calendarCells.length % 7 !== 0) calendarCells.push(null)

  function changeMonth(amount: number) {
    setVisibleMonth((previous) =>
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

    if (activity.type === 'meal') detail = `${activity.amount ?? 0} g`
    else if (activity.type === 'water') detail = `${activity.amount ?? 0} ml`
    else if (activity.type === 'walk') {
      detail = formatDuration(activity.duration ?? 0)
    }

    const mealLabel =
      activity.type === 'meal' && activity.mealSlot
        ? ` · ${MEAL_SLOTS.find((slot) => slot.id === activity.mealSlot)?.label ?? ''}`
        : ''

    return (
      <article className="activity-row" key={activity.id}>
        <div className={`activity-icon ${activity.type}`}>{info.icon}</div>
        <div className="activity-info">
          <h3>{info.label}</h3>
          <p>
            {formatTime(activity.time)}
            {detail ? ` · ${detail}` : ''}
            {mealLabel}
            {activity.notes ? ` · ${activity.notes}` : ''}
          </p>
        </div>
        <div className="activity-person">{activity.person}</div>
      </article>
    )
  }

  function renderDailySummary(list: Activity[]) {
    const types: ActivityType[] = ['pee', 'poop', 'meal', 'water', 'walk']

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
                <strong>{latest ? formatTime(latest.time) : '—'}</strong>
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
        <div className="header-left">
          <div className="brand">
            <div className="brand-icon">🐾</div>
            <div>
              <h1>Soli Track</h1>
              <p>Your dog's daily care companion</p>
            </div>
          </div>
        </div>

        <div className="plus-menu-wrap">
          <button
            className="plus-button"
            type="button"
            aria-label="Open create menu"
            aria-expanded={showPlusMenu}
            onClick={() => setShowPlusMenu((open) => !open)}
          >
            +
          </button>
          {showPlusMenu && (
            <div className="plus-dropdown">
              <button type="button" onClick={() => openActivityLogger()}>
                <span>📝</span> Log an activity
              </button>
              <button type="button" onClick={() => {
                setShowPlusMenu(false)
                setMedicalDate(dateKey(new Date()))
                setShowMedicalModal(true)
              }}>
                <span>🩺</span> Log a medical report
              </button>
              <button type="button" onClick={() => {
                setShowPlusMenu(false)
                setShowCaregiverModal(true)
              }}>
                <span>👥</span> Add or remove caregiver
              </button>
            </div>
          )}
        </div>
      </header>

      <label className="person-picker home-person-picker">
        <span>Logged as</span>
        <select
          value={person}
          onChange={(event) => setPerson(event.target.value)}
        >
          {people.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <nav className="tab-bar" aria-label="Main navigation">
        <button
          className={activeTab === 'home' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('home')}
        >
          <span>🏠</span> Home
        </button>
        <button
          className={activeTab === 'insights' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('insights')}
        >
          <span>📊</span> Insights
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
        <button
          className={activeTab === 'settings' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('settings')}
        >
          <span>⚙️</span> Settings
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

          {celebration?.date === today && (
            <section className="celebration-card" aria-live="polite">
              <div className="celebration-confetti" aria-hidden="true">
                🎉 ✨ 🎊 ✨ 🎉
              </div>
              <p className="eyebrow">TEAM SOLI · DAILY CELEBRATION</p>
              <h2>
                {celebration.winners.length === 1
                  ? `Amazing work, ${celebration.winners[0]}!`
                  : `Amazing work, ${celebration.winners.join(' & ')}!`}
              </h2>
              <p>
                {celebration.count} activities logged today. Thank you for
                taking such good care of {settings.petName || 'Soli'}! 🐾
              </p>
            </section>
          )}

          {overdueMealSlots.length > 0 && (
            <section className="meal-reminders-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">MEAL REMINDERS</p>
                  <h2>Have you fed {settings.petName || 'Soli'}? 🍽️</h2>
                </div>
              </div>
              <div className="meal-reminder-list">
                {overdueMealSlots.map((slot) => (
                  <div className="meal-reminder-row" key={slot.id}>
                    <div>
                      <strong>{slot.label}</strong>
                      <p>
                        Scheduled by{' '}
                        {settings.mealTimes[configuredMealSlots.findIndex((item) => item.id === slot.id)] ?? formatTime(new Date().setHours(Math.floor(slot.deadline / 60), slot.deadline % 60, 0, 0))}
                      </p>
                    </div>
                    <div className="meal-reminder-actions">
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => openActivityLogger('meal', slot.id)}
                      >
                        Log meal
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => dismissMealReminder(slot.id)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="food-goal-card">
            <div className="food-goal-top">
              <div>
                <p className="eyebrow">DAILY FOOD GOAL</p>
                <h3>{foodTotal} / {foodGoal} g</h3>
                <p className="muted">{Math.max(0, foodGoal - foodTotal)} g remaining</p>
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
              <div className="progress-fill" style={{ width: `${foodProgress}%` }} />
            </div>
            <p className="progress-caption">{Math.round(foodProgress)}% of daily goal</p>
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
                  setVisibleMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
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
              <button
                className="text-button"
                onClick={() => openActivityLogger()}
              >
                Manual entry +
              </button>
            </div>

            <div className="action-grid">
              <button className="action-button pee-action" onClick={() => logActivity('pee')}>
                <span>💧</span><strong>Pee</strong><small>Log pee</small>
              </button>
              <button className="action-button poop-action" onClick={() => logActivity('poop')}>
                <span>💩</span><strong>Poop</strong><small>Log poop</small>
              </button>
              <button className="action-button meal-action" onClick={() => setShowMealInput(!showMealInput)}>
                <span>🍽️</span><strong>Food</strong><small>Add a meal</small>
              </button>
              <button className="action-button water-action" onClick={() => setShowWaterInput(!showWaterInput)}>
                <span>🚰</span><strong>Water</strong><small>Log water</small>
              </button>
              <button
                className="action-button walk-action"
                onClick={() => walkStarted === null ? setWalkStarted(Date.now()) : finishWalk()}
              >
                <span>🐕</span>
                <strong>{walkStarted === null ? 'Walk' : 'Finish walk'}</strong>
                <small>{walkStarted === null ? 'Start a walk' : 'Save duration'}</small>
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
                onSubmit={(event) => { event.preventDefault(); logMeal() }}
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
                  <button type="submit" className="primary-button">Save meal</button>
                  <button type="button" className="secondary-button" onClick={() => setShowMealInput(false)}>Cancel</button>
                </div>
              </form>
            )}

            {showWaterInput && (
              <form
                className="inline-form"
                onSubmit={(event) => { event.preventDefault(); logWater() }}
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
                  <button type="submit" className="primary-button">Save water</button>
                  <button type="button" className="secondary-button" onClick={() => setShowWaterInput(false)}>Cancel</button>
                </div>
              </form>
            )}
          </section>

          <section className="content-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">MEDICAL RECORDS</p>
                <h2>{settings.petName || 'Soli'}'s medical reports 🩺</h2>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  setMedicalDate(dateKey(new Date()))
                  setShowMedicalModal(true)
                }}
              >
                Add report +
              </button>
            </div>

            {medicalReports.length === 0 ? (
              <p className="empty-state">
                No medical reports saved yet. Use “Add report” to keep vet visits,
                medications and other health notes in one place.
              </p>
            ) : (
              <div className="medical-report-list">
                {[...medicalReports]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 5)
                  .map((report) => (
                    <article className="medical-report-row" key={report.id}>
                      <div className="medical-report-icon">🩺</div>
                      <div className="medical-report-info">
                        <h3>{report.title}</h3>
                        <p>
                          {report.category} · {formatDate(report.date)} · Logged by {report.person}
                        </p>
                        {report.notes && <p className="medical-report-notes">{report.notes}</p>}
                      </div>
                      <button
                        type="button"
                        className="delete-report-button"
                        onClick={() => deleteMedicalReport(report)}
                        aria-label={`Delete ${report.title}`}
                      >
                        🗑️
                      </button>
                    </article>
                  ))}
              </div>
            )}
          </section>

          <section className="content-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">LATEST ENTRIES</p>
                <h2>Recent activity</h2>
              </div>
              <button className="text-button" onClick={() => setActiveTab('insights')}>
                See insights →
              </button>
            </div>
            {activities.length === 0 ? (
              <p className="empty-state">No activities logged yet. Start with a quick action above!</p>
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
              <p className="muted">Select any date to see {settings.petName || 'Soli'}'s daily totals.</p>
            </div>
          </div>

          <section className="content-card calendar-card">
            <div className="calendar-heading">
              <button className="calendar-nav" onClick={() => changeMonth(-1)} aria-label="Previous month">←</button>
              <h2>{monthYear}</h2>
              <button className="calendar-nav" onClick={() => changeMonth(1)} aria-label="Next month">→</button>
            </div>

            <button
              className="text-button today-button"
              onClick={() => {
                const now = new Date()
                setSelectedDate(dateKey(now))
                setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1))
              }}
            >
              Go to today
            </button>

            <div className="calendar-grid">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div className="calendar-weekday" key={day}>{day}</div>
              ))}

              {calendarCells.map((day, index) => {
                if (day === null) {
                  return <div className="calendar-empty" key={`empty-${index}`} />
                }

                const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)
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
                    ].filter(Boolean).join(' ')}
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

            {(() => {
              const dayCounts = people.map((name) => ({
                name,
                count: activities.filter((activity) => activity.person === name && dateKey(new Date(activity.time)) === selectedDate).length,
              }))
              const topCount = Math.max(0, ...dayCounts.map((item) => item.count))
              const winners = dayCounts.filter((item) => item.count === topCount && topCount > 0).map((item) => item.name)
              return winners.length > 0 ? (
                <div className="calendar-winner-summary">
                  <span className="winner-trophy">🏆</span>
                  <div>
                    <strong>{winners.length === 1 ? `${winners[0]} was the top caregiver` : `Top caregivers: ${winners.join(' & ')}`}</strong>
                    <p>{topCount} activities logged on this day</p>
                  </div>
                </div>
              ) : null
            })()}

            <div className="totals-grid">
              {(['pee', 'poop', 'meal', 'water', 'walk'] as ActivityType[]).map((type) => (
                <article className="total-card" key={type}>
                  <span className="total-icon">{ACTIVITY_INFO[type].icon}</span>
                  <span className="total-label">{ACTIVITY_INFO[type].label}</span>
                  <strong>{getTotalLabel(type, selectedActivities)}</strong>
                </article>
              ))}
            </div>

            {selectedDate === today && (
              <div className="selected-food-goal">
                <div className="food-goal-top">
                  <span>🍽️ Daily food goal</span>
                  <strong>{getTotal('meal', selectedActivities)} / {FOOD_GOAL} g</strong>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(100, (getTotal('meal', selectedActivities) / foodGoal) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </section>
        </section>
      )}

      {activeTab === 'insights' && (
        <section className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">UNDERSTAND HER ROUTINE</p>
              <h2>{settings.petName || 'Soli'}'s insights 📊</h2>
              <p className="muted">Caregiver contributions, feeding consistency, activity trends, and health history.</p>
            </div>
          </div>

          {(() => {
            const days = Array.from({ length: 7 }, (_, index) => {
              const date = new Date()
              date.setDate(date.getDate() - (6 - index))
              const key = dateKey(date)
              const entries = activities.filter((activity) => dateKey(new Date(activity.time)) === key)
              return { key, label: date.toLocaleDateString([], { weekday: 'short' }), entries }
            })
            const last7 = days.flatMap((day) => day.entries)
            const caregiverTotals = people.map((name) => ({
              name,
              count: last7.filter((activity) => activity.person === name).length,
            })).sort((a, b) => b.count - a.count)
            const highestCaregiverCount = Math.max(0, ...caregiverTotals.map((item) => item.count))
            const totalFood = last7.filter((activity) => activity.type === 'meal').reduce((sum, activity) => sum + (activity.amount ?? 0), 0)
            const daysWithFood = days.filter((day) => day.entries.some((activity) => activity.type === 'meal')).length
            const daysMeetingGoal = days.filter((day) => day.entries.filter((activity) => activity.type === 'meal').reduce((sum, activity) => sum + (activity.amount ?? 0), 0) >= foodGoal).length
            const recentReports = [...medicalReports].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
            const maxDailyCount = Math.max(1, ...days.map((day) => day.entries.length))
            const activityTypes: ActivityType[] = ['pee', 'poop', 'meal', 'water', 'walk']
            
            return (
              <>
                <section className="content-card insights-card">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">CARE TEAM</p>
                      <h2>Caregiver contributions</h2>
                      <p className="muted">Activities logged over the last 7 days</p>
                    </div>
                  </div>
                  {caregiverTotals.length === 0 || highestCaregiverCount === 0 ? (
                    <p className="empty-state">Start logging activities to see each caregiver's contribution.</p>
                  ) : caregiverTotals.map((item, index) => (
                    <div className="caregiver-stat-row" key={item.name}>
                      <div className="caregiver-stat-top">
                        <span>{index === 0 && item.count > 0 ? '🏆 ' : ''}{item.name}</span>
                        <strong>{item.count} {item.count === 1 ? 'activity' : 'activities'}</strong>
                      </div>
                      <div className="insight-progress-track">
                        <div className="insight-progress-fill" style={{ width: `${(item.count / highestCaregiverCount) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </section>

                <section className="content-card insights-card">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">NUTRITION</p>
                      <h2>Feeding consistency</h2>
                      <p className="muted">Based on the last 7 days of logged meals</p>
                    </div>
                  </div>
                  <div className="insight-stats-grid">
                    <article className="insight-stat">
                      <span>🍽️</span>
                      <strong>{Math.round(totalFood / 7)} g</strong>
                      <small>Average food per day</small>
                    </article>
                    <article className="insight-stat">
                      <span>📅</span>
                      <strong>{daysWithFood}/7</strong>
                      <small>Days with meals logged</small>
                    </article>
                    <article className="insight-stat">
                      <span>🎯</span>
                      <strong>{daysMeetingGoal}/7</strong>
                      <small>Days reaching {foodGoal} g goal</small>
                    </article>
                  </div>
                  <p className="insights-footnote">These statistics reflect only the information logged in Soli Track.</p>
                </section>

                <section className="content-card insights-card">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">DAILY PATTERNS</p>
                      <h2>Activity trends</h2>
                      <p className="muted">Total logged activities per day · last 7 days</p>
                    </div>
                  </div>
                  <div className="activity-trend-chart">
                    {days.map((day) => (
                      <div className="trend-day" key={day.key} title={`${formatDate(day.key)}: ${day.entries.length} activities`}>
                        <strong>{day.entries.length}</strong>
                        <div className="trend-bar-track">
                          <div className="trend-bar" style={{ height: `${Math.max(day.entries.length > 0 ? 8 : 0, (day.entries.length / maxDailyCount) * 100)}%` }} />
                        </div>
                        <span>{day.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="activity-breakdown">
                    {activityTypes.map((type) => {
                      const count = last7.filter((activity) => activity.type === type).length
                      return (
                        <div className="activity-breakdown-item" key={type}>
                          <span>{ACTIVITY_INFO[type].icon} {ACTIVITY_INFO[type].label}</span>
                          <strong>{count}</strong>
                        </div>
                      )
                    })}
                  </div>
                </section>

                <section className="content-card insights-card">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">HEALTH HISTORY</p>
                      <h2>Medical reports</h2>
                      <p className="muted">{medicalReports.length} saved {medicalReports.length === 1 ? 'report' : 'reports'}</p>
                    </div>
                    <button className="text-button" type="button" onClick={() => { setMedicalDate(dateKey(new Date())); setShowMedicalModal(true) }}>Add report +</button>
                  </div>
                  {recentReports.length === 0 ? (
                    <p className="empty-state">No medical reports yet. Add vet visits, medications, vaccinations, or test results here.</p>
                  ) : (
                    <div className="medical-report-list">
                      {recentReports.map((report) => (
                        <article className="medical-report-row" key={report.id}>
                          <div className="medical-report-icon">🩺</div>
                          <div className="medical-report-info">
                            <h3>{report.title}</h3>
                            <p>{report.category} · {formatDate(report.date)} · Logged by {report.person}</p>
                            {report.notes && <p className="medical-report-notes">{report.notes}</p>}
                          </div>
                          <button type="button" className="delete-report-button" onClick={() => deleteMedicalReport(report)} aria-label={`Delete ${report.title}`}>🗑️</button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="content-card insights-card">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">RECENT LOGS</p>
                      <h2>Latest activity</h2>
                    </div>
                  </div>
                  {sortedAllActivities.length === 0 ? (
                    <p className="empty-state">No activities logged yet.</p>
                  ) : (
                    <div className="activity-list">{sortedAllActivities.slice(0, 10).map(renderActivityRow)}</div>
                  )}
                </section>
              </>
            )
          })()}
        </section>
      )}

      {activeTab === 'settings' && (
        <section className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">MAKE IT YOURS</p>
              <h2>Settings ⚙️</h2>
              <p className="muted">Configure your pet's profile, feeding plan, and care team.</p>
            </div>
          </div>

          <section className="content-card">
            <div className="section-heading">
              <div><p className="eyebrow">PET PROFILE</p><h2>About {settings.petName || 'your pet'}</h2></div>
            </div>
            <div className="settings-grid">
              <label>Pet name
                <input value={settings.petName} onChange={(event) => setSettings((previous) => ({ ...previous, petName: event.target.value }))} placeholder="Soli" />
              </label>
              <label>Age
                <input value={settings.age} onChange={(event) => setSettings((previous) => ({ ...previous, age: event.target.value }))} placeholder="e.g. 2 years" />
              </label>
              <label>Weight
                <input value={settings.weight} onChange={(event) => setSettings((previous) => ({ ...previous, weight: event.target.value }))} placeholder="e.g. 18 kg" />
              </label>
              <label>Food type
                <input value={settings.foodType} onChange={(event) => setSettings((previous) => ({ ...previous, foodType: event.target.value }))} placeholder="Brand or food type" />
              </label>
            </div>
          </section>

          <section className="content-card">
            <div className="section-heading">
              <div><p className="eyebrow">FEEDING PLAN</p><h2>Daily meals</h2></div>
            </div>
            <div className="settings-grid">
              <label>Meals per day
                <select value={settings.mealsPerDay} onChange={(event) => setSettings((previous) => ({ ...previous, mealsPerDay: Number(event.target.value) }))}>
                  <option value={1}>1 meal</option><option value={2}>2 meals</option><option value={3}>3 meals</option>
                </select>
              </label>
              <label>Daily food goal (grams)
                <input type="number" min="1" value={settings.dailyFoodGoal} onChange={(event) => setSettings((previous) => ({ ...previous, dailyFoodGoal: Math.max(1, Number(event.target.value) || 1) }))} />
              </label>
              {Array.from({ length: settings.mealsPerDay }, (_, index) => (
                <label key={index}>{['Breakfast', 'Lunch', 'Dinner'][index]} time
                  <input type="time" value={settings.mealTimes[index] ?? ['08:00', '14:30', '19:30'][index]} onChange={(event) => setSettings((previous) => {
                    const mealTimes = [...previous.mealTimes]
                    mealTimes[index] = event.target.value
                    return { ...previous, mealTimes }
                  })} />
                </label>
              ))}
            </div>
            <p className="settings-note">Your settings are saved automatically in this browser.</p>
          </section>

          <section className="content-card">
            <div className="section-heading">
              <div><p className="eyebrow">CARE TEAM</p><h2>Caregivers</h2></div>
              <button className="text-button" type="button" onClick={() => setShowCaregiverModal(true)}>Manage caregivers +</button>
            </div>
            <div className="caregiver-chip-list">
              {people.map((name) => <span className="caregiver-chip" key={name}>{name}</span>)}
            </div>
          </section>
        </section>
      )}

      {activeTab === 'photos' && (
        <section className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">SOLI'S PERSONAL ALBUM</p>
              <h2>Photo gallery 📸</h2>
              <p className="muted">Keep your favorite moments together.</p>
            </div>
          </div>

          <section className="content-card photo-upload-card">
            <div className="photo-upload-icon">🐶</div>
            <h3>Add photos of Soli</h3>
            <p className="muted">Choose one or more images from your device.</p>
            <label className={`upload-button ${uploading ? 'uploading' : ''}`}>
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
            <p className="storage-note">Photos are saved in this browser on this device.</p>
          </section>

          {photoError && <div className="photo-error" role="alert">{photoError}</div>}

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
                <p>Upload your first photo of Soli and it will appear here.</p>
              </div>
            ) : (
              <div className="photo-grid">
                {photos.map((photo) => (
                  <PhotoCard key={photo.id} photo={photo} onDelete={deletePhoto} />
                ))}
              </div>
            )}
          </section>
        </section>
      )}

      {/* Manual activity dialog */}
      {showActivityModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowActivityModal(false)
        }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="activity-modal-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">SOLI'S CARE LOG</p>
                <h2 id="activity-modal-title">Log an activity</h2>
              </div>
              <button className="modal-close" type="button" onClick={() => setShowActivityModal(false)} aria-label="Close">×</button>
            </div>

            <form className="modal-form" onSubmit={saveManualActivity}>
              <label>
                Activity type
                <select
                  value={manualType}
                  onChange={(event) => {
                    const nextType = event.target.value as ActivityType
                    setManualType(nextType)
                    if (nextType === 'meal') setManualAmount('125')
                    if (nextType === 'water') setManualAmount('250')
                  }}
                >
                  <option value="pee">💧 Pee</option>
                  <option value="poop">💩 Poop</option>
                  <option value="meal">🍽️ Food / meal</option>
                  <option value="water">🚰 Water</option>
                  <option value="walk">🐕 Walk</option>
                </select>
              </label>

              <label>
                Date and time
                <input
                  type="datetime-local"
                  value={manualTime}
                  onChange={(event) => {
                    setManualTime(event.target.value)
                    setManualMealSlot(getMealSlotForTime(new Date(event.target.value).getTime()))
                  }}
                  required
                />
              </label>

              {manualType === 'meal' && (
                <>
                  <label>
                    Meal
                    <select value={manualMealSlot} onChange={(event) => setManualMealSlot(event.target.value as MealSlot)}>
                      <option value="breakfast">Breakfast</option>
                      <option value="lunch">Lunch</option>
                      <option value="dinner">Dinner</option>
                    </select>
                  </label>
                  <label>
                    Food amount (grams)
                    <input type="number" min="1" value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} required />
                  </label>
                </>
              )}

              {manualType === 'water' && (
                <label>
                  Water amount (ml)
                  <input type="number" min="1" value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} required />
                </label>
              )}

              {manualType === 'walk' && (
                <label>
                  Walk duration (minutes)
                  <input type="number" min="1" value={manualDuration} onChange={(event) => setManualDuration(event.target.value)} required />
                </label>
              )}

              {(manualType === 'pee' || manualType === 'poop') && (
                <label>
                  Notes (optional)
                  <textarea
                    rows={3}
                    value={manualNotes}
                    onChange={(event) => setManualNotes(event.target.value)}
                    placeholder={manualType === 'pee' ? 'e.g. normal amount, unusual color…' : 'e.g. consistency, color, anything unusual…'}
                  />
                </label>
              )}

              {manualType !== 'pee' && manualType !== 'poop' && (
                <label>
                  Notes (optional)
                  <textarea
                    rows={3}
                    value={manualNotes}
                    onChange={(event) => setManualNotes(event.target.value)}
                    placeholder="Add any details…"
                  />
                </label>
              )}

              <p className="modal-helper">Logged by: <strong>{person}</strong></p>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowActivityModal(false)}>Cancel</button>
                <button type="submit" className="primary-button">Save activity</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Medical report dialog */}
      {showMedicalModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowMedicalModal(false)
        }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="medical-modal-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">HEALTH RECORDS</p>
                <h2 id="medical-modal-title">Log a medical report</h2>
              </div>
              <button className="modal-close" type="button" onClick={() => setShowMedicalModal(false)} aria-label="Close">×</button>
            </div>

            <form className="modal-form" onSubmit={saveMedicalReport}>
              <label>
                Report title
                <input
                  value={medicalTitle}
                  onChange={(event) => setMedicalTitle(event.target.value)}
                  placeholder="e.g. Annual vet check-up"
                  required
                />
              </label>

              <label>
                Report type
                <select value={medicalCategory} onChange={(event) => setMedicalCategory(event.target.value)}>
                  <option>Vet visit</option>
                  <option>Medication</option>
                  <option>Vaccination</option>
                  <option>Test results</option>
                  <option>Allergy</option>
                  <option>Other</option>
                </select>
              </label>

              <label>
                Date
                <input type="date" value={medicalDate} onChange={(event) => setMedicalDate(event.target.value)} required />
              </label>

              <label>
                Notes / details
                <textarea
                  rows={4}
                  value={medicalNotes}
                  onChange={(event) => setMedicalNotes(event.target.value)}
                  placeholder="Vet instructions, medication dosage, follow-up date…"
                />
              </label>

              <p className="modal-helper">This report will be saved locally in this browser. Logged by: <strong>{person}</strong></p>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowMedicalModal(false)}>Cancel</button>
                <button type="submit" className="primary-button">Save report</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showCaregiverModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCaregiverModal(false) }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="caregiver-modal-title">
            <div className="modal-heading">
              <div><p className="eyebrow">THE CARE TEAM</p><h2 id="caregiver-modal-title">Manage caregivers</h2></div>
              <button className="modal-close" type="button" onClick={() => setShowCaregiverModal(false)} aria-label="Close">×</button>
            </div>
            <form className="modal-form" onSubmit={(event) => {
              event.preventDefault()
              const name = newCaregiver.trim()
              if (!name || people.some((personName) => personName.toLowerCase() === name.toLowerCase())) return
              setPeople((previous) => [...previous, name])
              setNewCaregiver('')
            }}>
              <label>Add caregiver
                <input value={newCaregiver} onChange={(event) => setNewCaregiver(event.target.value)} placeholder="Enter caregiver name" />
              </label>
              <button type="submit" className="primary-button">Add caregiver</button>
            </form>
            <div className="caregiver-manage-list">
              {people.map((name) => (
                <div className="caregiver-manage-row" key={name}>
                  <span>👤 {name}</span>
                  <button type="button" className="delete-report-button" disabled={people.length <= 1} onClick={() => {
                    if (window.confirm(`Remove ${name} from the caregiver list? Existing activity records will remain.`)) {
                      setPeople((previous) => previous.filter((item) => item !== name))
                    }
                  }} aria-label={`Remove ${name}`} title={people.length <= 1 ? 'At least one caregiver is required' : `Remove ${name}`}>Remove</button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {showCelebrationPopup && celebration?.date === today && (
        <div className="modal-backdrop celebration-backdrop" role="presentation">
          <section className="celebration-popup" role="dialog" aria-modal="true" aria-labelledby="celebration-title">
            <div className="celebration-confetti" aria-hidden="true">🎉 ✨ 🎊 ✨ 🎉</div>
            <div className="celebration-paw">🏆</div>
            <p className="eyebrow">TEAM SOLI · DAILY CELEBRATION</p>
            <h2 id="celebration-title">{celebration.winners.length === 1 ? `Amazing work, ${celebration.winners[0]}!` : `Amazing work, ${celebration.winners.join(' & ')}!`}</h2>
            <p>{celebration.count} activities logged today. Thank you for taking such good care of {settings.petName || 'Soli'}! 🐾</p>
            <button className="primary-button" type="button" onClick={() => setShowCelebrationPopup(false)}>Celebrate!</button>
          </section>
        </div>
      )}

      <footer className="app-footer">Made with ❤️ for {settings.petName || 'Soli'}</footer>
    </main>
  )
}

export default App