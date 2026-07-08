import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/useAuth'

function formatTimer(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export default function Home() {
  const { user } = useAuth()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [tasks, setTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [latestLine, setLatestLine] = useState('')
  const [helpedTaskId, setHelpedTaskId] = useState(null)
  const [adjustedDone, setAdjustedDone] = useState({})

  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const chunksRef = useRef([])
  const timerIntervalRef = useRef(null)

  const displayName = useMemo(() => {
    return user?.user_metadata?.name || user?.email?.split('@')[0] || 'there'
  }, [user])

  const loadTasks = useCallback(async () => {
    if (!user?.id) return
    setTasksLoading(true)

    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, description, status')
      .eq('coachee_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Failed to load tasks:', error)
      setTasks([])
    } else {
      setTasks(data || [])
    }

    setTasksLoading(false)
  }, [user?.id])

  const loadLatestEntry = useCallback(async () => {
    if (!user?.id) return

    const { data, error } = await supabase
      .from('entries')
      .select('transcript')
      .eq('coachee_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Failed to load latest entry:', error)
      setLatestLine('')
      return
    }

    const transcript = data?.transcript?.trim()
    if (!transcript) {
      setLatestLine('')
      return
    }

    const normalized = transcript.replace(/\s+/g, ' ')
    setLatestLine(normalized.length > 92 ? `${normalized.slice(0, 92)}...` : normalized)
  }, [user?.id])

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
  }

  const stopTracks = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
  }

  useEffect(() => {
    if (!user?.id) return
    loadTasks()
    loadLatestEntry()
  }, [user?.id, loadLatestEntry, loadTasks])

  useEffect(() => {
    return () => {
      stopTimer()
      stopTracks()
    }
  }, [])

  const openRecorderModal = () => {
    setStatusMessage('')
    setErrorMessage('')
    setRecordingSeconds(0)
    setIsModalOpen(true)
  }

  const closeRecorderModal = () => {
    if (isRecording || isSubmitting) return
    setIsModalOpen(false)
    setRecordingSeconds(0)
  }

  const startRecording = async () => {
    setErrorMessage('')
    setStatusMessage('')

    try {
      if (
        typeof window === 'undefined' ||
        !navigator.mediaDevices ||
        !window.MediaRecorder
      ) {
        setErrorMessage('Your browser does not support audio recording.')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      chunksRef.current = []

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.start()
      setIsRecording(true)
      setRecordingSeconds(0)

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1)
      }, 1000)
    } catch (error) {
      console.error('Failed to access microphone:', error)
      setErrorMessage(
        'Could not access your microphone. Please allow mic permissions and try again.'
      )
      stopTracks()
    }
  }

  const finishRecording = async () => {
    if (!mediaRecorderRef.current || !isRecording) return

    setIsRecording(false)
    stopTimer()
    setIsSubmitting(true)
    setStatusMessage('Finishing recording...')
    setErrorMessage('')

    const recorder = mediaRecorderRef.current

    recorder.onstop = async () => {
      try {
        const mimeType =
          chunksRef.current[0]?.type || recorder.mimeType || 'audio/webm'
        const audioBlob = new Blob(chunksRef.current, { type: mimeType })

        const formData = new FormData()
        formData.append('audio', audioBlob, 'entry.webm')

        setStatusMessage('Sending audio for transcription...')

        const { error } = await supabase.functions.invoke('transcribe-entry', {
          body: formData,
        })

        if (error) {
          console.error('transcribe-entry function error:', error)
          setErrorMessage(
            error.message || 'Failed to transcribe and save your entry.'
          )
          return
        }

        setStatusMessage('Transcript saved successfully.')
        await loadLatestEntry()
      } catch (error) {
        console.error('Failed to process recording:', error)
        setErrorMessage('Something went wrong while processing your recording.')
      } finally {
        setIsSubmitting(false)
        mediaRecorderRef.current = null
        chunksRef.current = []
        stopTracks()
      }
    }

    recorder.stop()
  }

  const markTaskDone = async (taskId) => {
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'done' })
      .eq('id', taskId)
      .eq('coachee_id', user.id)

    if (error) {
      console.error('Failed to update task status:', error)
      return
    }

    setTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, status: 'done' } : task))
    )
  }

  const messageLine =
    latestLine || 'Your daily voice check-in helps us shape the next best step.'

  return (
    <div className="screen">
      <div className="screen-content">
        <header className="row-between">
          <div>
            <h1 className="screen-title">Good morning, {displayName} ✨</h1>
            <p className="muted-line">{messageLine}</p>
          </div>
          <button className="icon-button" aria-label="Notifications">
            ⊙
          </button>
        </header>

        <button className="record-card" onClick={openRecorderModal}>
          <span className="record-icon">●</span>
          <div>
            <p className="record-title">Record Your Day</p>
            <p className="record-subtitle">TAP TO TALK. I&apos;M HERE TO LISTEN.</p>
          </div>
        </button>

        <section className="focus-banner">
          <span>◌</span>
          <p>
            <strong>Focus for Today:</strong> Complete one small thing before noon.
          </p>
        </section>

        <div className="row-between section-head">
          <h2 className="section-title">Your 3-Step Plan</h2>
          <button className="ghost-button" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>

        {tasksLoading ? <p className="muted-line">Loading your tasks...</p> : null}

        {!tasksLoading && tasks.length === 0 ? (
          <p className="muted-line">No tasks yet. Your coach will add your first steps soon.</p>
        ) : null}

        {!tasksLoading &&
          tasks.map((task) => {
            const isDone = String(task.status).toLowerCase() === 'done'
            const isHelpState = helpedTaskId === task.id
            const isAdjustedDone = !!adjustedDone[task.id]

            return (
              <article className="task-wrap" key={task.id}>
                <div className={`task-card ${isDone || isHelpState ? 'task-card-done' : ''}`}>
                  <div className="task-left">
                    <span className="task-check">{isDone || isHelpState ? '✓' : '○'}</span>
                    <div>
                      <p className={`task-title ${isDone || isHelpState ? 'strike' : ''}`}>
                        {task.title}
                      </p>
                      <p className="task-subtitle">{task.description || 'Small consistent progress.'}</p>
                    </div>
                  </div>

                  <div className="task-actions">
                    <button className="pill-done" onClick={() => markTaskDone(task.id)}>
                      Done
                    </button>
                    <button className="pill-help" onClick={() => setHelpedTaskId(task.id)}>
                      Help
                    </button>
                  </div>
                </div>

                {isHelpState ? (
                  <div className="adjusted-banner">
                    <p className="adjusted-message">❤ My fault, that plan was too hard.</p>
                    <p className="adjusted-label">ADJUSTED STEP</p>
                    <div className="adjusted-row">
                      <p className="adjusted-task">
                        {isAdjustedDone
                          ? 'Great job finishing the adjusted step.'
                          : 'Set a 2-minute timer and do the easiest version right now.'}
                      </p>
                      <button
                        className="pill-done"
                        onClick={() =>
                          setAdjustedDone((prev) => ({ ...prev, [task.id]: true }))
                        }
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            )
          })}
      </div>

      {isModalOpen ? (
        <div className="recording-overlay">
          <div className="recording-shell">
            <div className="row-between">
              <button className="overlay-icon-btn" onClick={closeRecorderModal}>
                ✕
              </button>
              <span className="private-pill">🔒 Private &amp; Secure</span>
            </div>

            <div className="recording-center">
              <h3>I&apos;m listening...</h3>
              <p>Speak freely. It stays between us.</p>

              <button
                className={`mic-circle ${isRecording ? 'pulse' : ''}`}
                onClick={isRecording ? finishRecording : startRecording}
                disabled={isSubmitting}
              >
                🎤
              </button>

              <div className="wave-bars">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>

              <p className="timer-text">{formatTimer(recordingSeconds)}</p>
              <p className="recording-text">
                {isRecording ? 'Recording in progress' : 'Tap mic to start recording'}
              </p>
              {statusMessage ? <p className="status-light">{statusMessage}</p> : null}
              {errorMessage ? <p className="status-error">{errorMessage}</p> : null}
            </div>

            <div className="overlay-actions">
              <button
                className="overlay-cancel"
                onClick={closeRecorderModal}
                disabled={isRecording || isSubmitting}
              >
                Cancel
              </button>
              <button
                className="overlay-finish"
                onClick={finishRecording}
                disabled={!isRecording || isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Finish'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="bottom-nav">
        <Link className="bottom-nav-link active" to="/home">
          Home
        </Link>
        <Link className="bottom-nav-link" to="/library">
          Library
        </Link>
      </div>
    </div>
  )
}

