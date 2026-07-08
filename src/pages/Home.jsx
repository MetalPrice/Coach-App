import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/useAuth'
import BottomNav from '../components/BottomNav'

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
  const [helpLoadingTaskId, setHelpLoadingTaskId] = useState(null)
  const [undoLoadingTaskId, setUndoLoadingTaskId] = useState(null)

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
      .select('id, title, description, status, is_downgraded, reframe_message, guidance')
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

  const hasHelpGuidance = (task) => {
    return Boolean(task?.is_downgraded) || Boolean(task?.reframe_message) || Boolean(task?.guidance)
  }

  const requestHelpForTask = async (task) => {
    if (!task?.id || !user?.id) return
    setHelpLoadingTaskId(task.id)
    try {
      const { data, error } = await supabase.functions.invoke('downgrade-task', {
        body: {
          id: task.id,
          title: task.title,
          description: task.description,
        },
      })

      if (error) throw error

      const updatedTask = data?.task ?? null

      if (updatedTask) {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, ...updatedTask } : t))
        )
      } else {
        // Fallback: ensure UI has something to render
        if (data?.guidance?.reframe_message || data?.guidance?.guidance) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id
                ? {
                    ...t,
                    is_downgraded: true,
                    reframe_message: data.guidance.reframe_message,
                    guidance: data.guidance.guidance,
                  }
                : t
            )
          )
        }
      }

      setHelpedTaskId(task.id)
    } catch (err) {
      console.error('Failed to request guidance:', err)
    } finally {
      setHelpLoadingTaskId(null)
    }
  }

  const undoTask = async (taskId) => {
    if (!taskId || !user?.id) return
    setUndoLoadingTaskId(taskId)
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'active' })
        .eq('id', taskId)
        .eq('coachee_id', user.id)

      if (error) throw error

      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: 'active' } : t))
      )

      if (helpedTaskId === taskId) setHelpedTaskId(null)
    } catch (err) {
      console.error('Failed to undo task:', err)
    } finally {
      setUndoLoadingTaskId(null)
    }
  }

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

        {tasksLoading ? (
          <div className="skeleton-stack">
            <div className="skeleton-task" />
            <div className="skeleton-task" />
            <div className="skeleton-task" />
          </div>
        ) : null}

        {!tasksLoading && tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✦</div>
            <p className="empty-title">
              Your coach is reviewing your latest entry - check back soon
            </p>
            <p className="empty-text">You are doing great by showing up today.</p>
          </div>
        ) : null}

        {!tasksLoading &&
          tasks.map((task, index) => {
            const isDone = String(task.status).toLowerCase() === 'done'
            const hasGuidance = hasHelpGuidance(task)
            const helpJustRequested = helpedTaskId === task.id
            const canShowHelp = !isDone && !hasGuidance
            const showHelpBanner = hasGuidance

            return (
              <article
                className="task-wrap task-entrance"
                key={task.id}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div
                  className={`task-card ${
                    isDone || helpJustRequested ? 'task-card-done' : ''
                  }`}
                >
                  <div className="task-left">
                    <span
                      className={`task-check ${
                        isDone || helpJustRequested ? 'checked' : ''
                      }`}
                    >
                      {isDone || helpJustRequested ? '✓' : '○'}
                    </span>
                    <div>
                      <p
                        className={`task-title ${
                          isDone || helpJustRequested ? 'strike' : ''
                        }`}
                      >
                        <span className="task-title-text">{task.title}</span>
                      </p>
                      <p className="task-subtitle">{task.description || 'Small consistent progress.'}</p>
                    </div>
                  </div>

                  <div className="task-actions">
                    {isDone ? (
                      <button
                        type="button"
                        className="undo-link"
                        onClick={() => undoTask(task.id)}
                        disabled={undoLoadingTaskId === task.id}
                      >
                        {undoLoadingTaskId === task.id ? 'Undoing…' : 'Undo'}
                      </button>
                    ) : (
                      <>
                        <button
                          className="pill-done"
                          onClick={() => markTaskDone(task.id)}
                        >
                          Done
                        </button>
                        {canShowHelp ? (
                          <button
                            className="pill-help"
                            onClick={() => requestHelpForTask(task)}
                            disabled={helpLoadingTaskId === task.id}
                          >
                            {helpLoadingTaskId === task.id ? 'Help…' : 'Help'}
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                {helpJustRequested || showHelpBanner ? (
                  <div className="adjusted-banner">
                    <p className="adjusted-message">{task.reframe_message || 'Let’s break it down instead of skipping it.'}</p>
                    {task.guidance ? (
                      <p className="help-guidance-text">{task.guidance}</p>
                    ) : null}
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

              <div className={`wave-bars ${isRecording ? 'active' : ''}`}>
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

      <BottomNav />
    </div>
  )
}

