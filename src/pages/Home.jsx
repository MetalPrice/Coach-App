import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

function formatTimer(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const chunksRef = useRef([])
  const timerIntervalRef = useRef(null)

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

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <h2>Home (Coachee)</h2>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={openRecorderModal}>Record Your Day</button>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>

      {isModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 460,
              borderRadius: 12,
              padding: 20,
              background: '#202020',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Record Your Day</h3>

            <p style={{ marginBottom: 8 }}>
              {isRecording ? 'Recording in progress' : 'Ready to record'}
            </p>
            <p style={{ fontSize: 28, marginTop: 0, marginBottom: 16 }}>
              {formatTimer(recordingSeconds)}
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              {!isRecording ? (
                <button onClick={startRecording} disabled={isSubmitting}>
                  Start Recording
                </button>
              ) : (
                <button onClick={finishRecording} disabled={isSubmitting}>
                  Finish
                </button>
              )}

              <button onClick={closeRecorderModal} disabled={isRecording || isSubmitting}>
                Close
              </button>
            </div>

            {isSubmitting ? (
              <p style={{ marginTop: 12 }}>Working...</p>
            ) : null}
            {statusMessage ? <p style={{ marginTop: 12 }}>{statusMessage}</p> : null}
            {errorMessage ? (
              <p style={{ marginTop: 12, color: '#ff8b8b' }}>{errorMessage}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

