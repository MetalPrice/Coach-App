import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/useAuth'

async function saveMeetingNote({ coacheeId, coachId, extractedText }) {
  const { data, error } = await supabase
    .from('meeting_notes')
    .insert({
      coachee_id: coacheeId,
      coach_id: coachId,
      status: 'pending',
      raw_text: extractedText,
      suggested_tasks: null,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export default function Admin() {
  const { user } = useAuth()
  const [coachees, setCoachees] = useState([])
  const [selectedCoacheeId, setSelectedCoacheeId] = useState('')
  const [pdfFile, setPdfFile] = useState(null)
  const [suggestedTasks, setSuggestedTasks] = useState([])
  const [statusText, setStatusText] = useState('')
  const [errorText, setErrorText] = useState('')
  const [loadingCoachees, setLoadingCoachees] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [meetingNoteId, setMeetingNoteId] = useState(null)

  const canSubmit = useMemo(() => {
    return Boolean(selectedCoacheeId && pdfFile && !isSubmitting)
  }, [selectedCoacheeId, pdfFile, isSubmitting])

  useEffect(() => {
    async function loadCoachees() {
      setLoadingCoachees(true)
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .eq('role', 'coachee')
        .order('name', { ascending: true })

      if (error) {
        console.error('Failed to load coachees:', error)
        setErrorText('Could not load coachees. Check your users table/RLS.')
        setCoachees([])
      } else {
        setCoachees(data || [])
      }
      setLoadingCoachees(false)
    }

    loadCoachees()
  }, [])

  useEffect(() => {
    async function loadExistingNote(coacheeId) {
      if (!coacheeId || !user?.id) {
        setMeetingNoteId(null)
        setSuggestedTasks([])
        return
      }

      setStatusText('')
      setErrorText('')

      const { data, error } = await supabase
        .from('meeting_notes')
        .select('id, status, suggested_tasks')
        .eq('coachee_id', coacheeId)
        .in('status', ['pending', 'reviewed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('Failed to load existing meeting note:', error)
        setMeetingNoteId(null)
        setSuggestedTasks([])
        return
      }

      if (!data) {
        setMeetingNoteId(null)
        setSuggestedTasks([])
        return
      }

      setMeetingNoteId(data.id)
      const tasks = Array.isArray(data.suggested_tasks) ? data.suggested_tasks : []
      setSuggestedTasks(tasks)
      if (tasks.length > 0) {
        setStatusText('Restored suggested tasks from your last meeting note.')
      }
    }

    loadExistingNote(selectedCoacheeId)
  }, [selectedCoacheeId, user?.id])

  const onUploadAndExtract = async () => {
    if (!canSubmit || !user?.id) return

    setIsSubmitting(true)
    setErrorText('')
    setSuggestedTasks([])

    try {
      setStatusText('Uploading PDF and extracting text...')
      const pdfFormData = new FormData()
      pdfFormData.append('file', pdfFile)

      const { data: pdfData, error: pdfError } = await supabase.functions.invoke(
        'extract-pdf',
        {
          body: pdfFormData,
        }
      )

      if (pdfError) throw pdfError

      const extractedText = String(pdfData?.text || '').trim()
      if (!extractedText) {
        throw new Error('No text was extracted from the uploaded PDF.')
      }

      setStatusText('Saving meeting note...')
      const noteId = await saveMeetingNote({
        coacheeId: selectedCoacheeId,
        coachId: user.id,
        extractedText,
      })
      setMeetingNoteId(noteId)

      setStatusText('Extracting suggested tasks...')
      const { data: taskData, error: taskError } = await supabase.functions.invoke(
        'extract-tasks',
        {
          body: { notes: extractedText },
        }
      )

      if (taskError) throw taskError

      const tasks = Array.isArray(taskData?.tasks) ? taskData.tasks : []
      setSuggestedTasks(tasks)

      if (noteId) {
        await supabase
          .from('meeting_notes')
          .update({ suggested_tasks: tasks })
          .eq('id', noteId)
      }
      setStatusText('Done. Meeting notes saved and tasks extracted.')
    } catch (error) {
      console.error('Meeting notes extraction flow failed:', error)
      setStatusText('')
      setErrorText(error?.message || 'Failed to process meeting notes.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateTaskField = (index, field, value) => {
    setSuggestedTasks((prev) =>
      prev.map((task, idx) =>
        idx === index ? { ...task, [field]: value } : task
      )
    )
  }

  const removeTaskAt = (index) => {
    setSuggestedTasks((prev) => prev.filter((_, idx) => idx !== index))
  }

  const addEmptyTask = () => {
    setSuggestedTasks((prev) => [
      ...prev,
      { title: '', description: '' },
    ])
  }

  const onAssignToCoachee = async () => {
    if (!selectedCoacheeId || !user?.id || suggestedTasks.length === 0) return

    const cleaned = suggestedTasks
      .map((t) => ({
        title: String(t.title || '').trim(),
        description: String(t.description || '').trim(),
      }))
      .filter((t) => t.title && t.description)

    if (cleaned.length === 0) {
      setErrorText('Please provide at least one task with a title and description.')
      return
    }

    setIsSubmitting(true)
    setErrorText('')
    setStatusText('Assigning tasks to coachee...')

    try {
      const payload = cleaned.map((task) => ({
        coachee_id: selectedCoacheeId,
        assigned_by: user.id,
        title: task.title,
        description: task.description,
        status: 'active',
      }))

      const { error: insertError } = await supabase.from('tasks').insert(payload)
      if (insertError) throw insertError

      if (meetingNoteId) {
        await supabase
          .from('meeting_notes')
          .update({ status: 'assigned', suggested_tasks: cleaned })
          .eq('id', meetingNoteId)
      }

      const coacheeName =
        coachees.find((c) => c.id === selectedCoacheeId)?.name || 'coachee'

      setStatusText(`Tasks assigned to ${coacheeName}.`)
      setPdfFile(null)
      setSuggestedTasks([])
      setMeetingNoteId(null)
    } catch (error) {
      console.error('Failed to assign tasks to coachee:', error)
      setErrorText(error?.message || 'Failed to assign tasks to coachee.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="screen">
      <div className="screen-content">
        <div className="row-between">
          <div>
            <h1 className="screen-title">Meeting Notes</h1>
            <p className="muted-line">
              Upload a coaching notes PDF, save extracted text, and generate suggested tasks.
            </p>
          </div>
          <button className="ghost-button" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>

        <div className="journal-card" style={{ marginTop: 18 }}>
          <label className="auth-label">
            <span>Select coachee</span>
            <select
              className="auth-input"
              value={selectedCoacheeId}
              onChange={(e) => setSelectedCoacheeId(e.target.value)}
              disabled={loadingCoachees || isSubmitting}
            >
              <option value="">
                {loadingCoachees ? 'Loading coachees...' : 'Choose a coachee'}
              </option>
              {coachees.map((coachee) => (
                <option key={coachee.id} value={coachee.id}>
                  {coachee.name || coachee.id}
                </option>
              ))}
            </select>
          </label>

          <label className="auth-label" style={{ marginTop: 14 }}>
            <span>PDF meeting notes</span>
            <input
              className="auth-input"
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              disabled={isSubmitting}
            />
          </label>

          <button
            className="auth-primary-btn"
            style={{ marginTop: 16, width: '100%' }}
            onClick={onUploadAndExtract}
            disabled={!canSubmit}
          >
            {isSubmitting ? 'Processing...' : 'Upload & Extract'}
          </button>

          {statusText ? <p className="auth-ok">{statusText}</p> : null}
          {errorText ? <p className="auth-error">{errorText}</p> : null}
        </div>

        <div style={{ marginTop: 18 }}>
          <h2 className="section-title">Suggested Tasks</h2>
          {suggestedTasks.length === 0 ? (
            <p className="muted-line">No extracted tasks yet.</p>
          ) : (
            <div className="skeleton-stack" style={{ marginTop: 8 }}>
              {suggestedTasks.map((task, idx) => (
                <article className="task-card" key={`${task.title}-${idx}`}>
                  <div style={{ width: '100%', display: 'grid', gap: 6 }}>
                    <input
                      className="auth-input"
                      placeholder="Task title"
                      value={task.title}
                      onChange={(e) => updateTaskField(idx, 'title', e.target.value)}
                    />
                    <textarea
                      className="auth-input"
                      rows={2}
                      placeholder="One sentence of context"
                      value={task.description}
                      onChange={(e) =>
                        updateTaskField(idx, 'description', e.target.value)
                      }
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="pill-help"
                        onClick={() => removeTaskAt(idx)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="pill-help"
              onClick={addEmptyTask}
              disabled={isSubmitting}
            >
              Add task
            </button>
            <button
              type="button"
              className="auth-primary-btn"
              style={{ flex: 1 }}
              onClick={onAssignToCoachee}
              disabled={isSubmitting || suggestedTasks.length === 0 || !selectedCoacheeId}
            >
              {isSubmitting ? 'Assigning…' : 'Assign to Coachee'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

