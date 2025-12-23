/* eslint-disable @typescript-eslint/no-explicit-any */
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"

// Hook: useMeetings
// Centralizes meeting data flow for the Home page. It:
// - Detects the authenticated user
// - Loads upcoming calendar events and past meetings from API routes
// - Tracks calendar connection status and loading/error states
// - Provides optimistic toggle for the "bot scheduled" flag per meeting
// - Exposes small utilities for attendees parsing and initials generation

// Shape of an upcoming calendar event as returned from /api/meetings/upcoming
export interface CalendarEvent {
    id: string
    summary?: string
    start?: {
        dateTime?: string
        date?: string
    }
    attendees?: Array<{ email: string }>
    location?: string
    hangoutLink?: string
    conferenceData?: any
    // Whether the meeting bot is scheduled to join this event (optimistically controlled)
    botScheduled?: boolean
    // Backend meeting identifier used when toggling bot state
    meetingId?: string
    // Whether the bot has already been sent for this meeting
    botSent?: boolean

}

// Shape of a past meeting as returned from /api/meetings/past
export interface PastMeeting {
    id: string
    title: string
    description?: string | null
    meetingUrl: string | null
    startTime: Date
    endTime: Date
    attendees?: any
    transcriptReady: boolean
    recordingUrl?: string | null
    speakers?: any
}

// Provides meeting data, connection/status flags, actions, and helpers for UI
export function useMeetings() {
    const session = useSession()
    const  userId  = session.data?.user.id
    // Upcoming events fetched from Google Calendar proxy
    const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([])
    // Past meetings fetched from backend
    const [pastMeetings, setPastMeetings] = useState<PastMeeting[]>([])
    // Loading flag for upcoming events and connection status
    const [loading, setLoading] = useState(false)
    // Loading flag for past meetings
    const [pastLoading, setPastLoading] = useState(false)
    // Whether user's calendar is connected for auto-sync
    const [connected, setConnected] = useState(false)
    // Error message related to upcoming events/connection flow
    const [error, setError] = useState<string>('')
    // Per-event bot toggle state (optimistic UI)
    const [botToggles, setBotToggles] = useState<{ [key: string]: boolean }>({})
    // Whether initial fetch cycle is still in progress (used to gate UI)
    const [initialLoading, setInitialLoading] = useState(true)


    useEffect(() => {
        // Trigger initial data fetch once we know who the user is
        if (userId) {
            fetchUpcomingEvents()
            fetchPastMeetings()
        }
    }, [userId])

    const fetchUpcomingEvents = async () => {
        // Fetches calendar connection status and, if connected, loads upcoming events.
        // Populates local bot toggle state based on events.
        setLoading(true)
        setError('')

        try {
            // 1) Check if calendar is connected for auto-sync
            const statusResponse = await fetch('/api/user/calendar-status')
            const statusData = await statusResponse.json()

            if (!statusData.connected) {
                // Early exit: no connection means no upcoming auto-synced events
                setConnected(false)
                setUpcomingEvents([])
                setError('Calendar not connected for auto-sync. Connect to enable auto syncing.')
                setLoading(false)
                setInitialLoading(false)
                return
            }

            // 2) Fetch upcoming events when connected
            const response = await fetch('/api/meetings/upcoming')
            const result = await response.json()

            if (!response.ok) {
                setError(result.error || 'Failed to fetch meetings')
                setConnected(false)
                setInitialLoading(false)
                return
            }

            // Store events and mark as connected
            setUpcomingEvents(result.events as CalendarEvent[])
            setConnected(result.connected)

            // Initialize optimistic bot toggle states per event
            const toggles: { [key: string]: boolean } = {}
            result.events.forEach((event: CalendarEvent) => {
                toggles[event.id] = event.botScheduled ?? true
            })

            setBotToggles(toggles)

        } catch {
            // Network or unexpected error
            setError("failed to fetch calendar events. please try again")
            setConnected(false)
        }

        setLoading(false)
        setInitialLoading(false)

    }

    const fetchPastMeetings = async () => {
        // Fetches list of past meetings for the current user
        setPastLoading(true)
        try {
            const response = await fetch('/api/meetings/past')
            const result = await response.json()

            if (!response.ok) {
                console.error('failed to fetch past meetings:', result.error)
                return
            }

            if (result.error) {
                return
            }
            setPastMeetings(result.meetings as PastMeeting[])
        } catch (error) {
            console.error('failed to fetch past meetings:', error)
        }
        setPastLoading(false)
    }

    const toggleBot = async (eventId: string) => {
        // Optimistically toggles the bot scheduled flag for a given upcoming event
        try {
            const event = upcomingEvents.find(e => e.id === eventId)
            if (!event?.meetingId) {
                // Cannot toggle if we cannot tie it back to a backend meeting
                return
            }

            // Optimistic UI update
            setBotToggles(prev => ({
                ...prev,
                [eventId]: !prev[eventId]
            }))

            // Persist to backend
            const response = await fetch(`/api/meetings/${event.meetingId}/bot-toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    botScheduled: !botToggles[eventId]
                })
            })

            if (!response.ok) {
                // Roll back optimistic change on failure
                setBotToggles(prev => ({
                    ...prev,
                    [eventId]: !prev[eventId]
                }))
            }
        } catch {
            // Roll back on unexpected errors
            setBotToggles(prev => ({
                ...prev,
                [eventId]: !prev[eventId]
            }))
        }
    }

    const sendBot = async (eventId: string, meetingId: string) => {
        // Sends bot to a specific meeting when user clicks "Send Bot" button
        try {
            const response = await fetch(`/api/meetings/${meetingId}/send-bot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to send bot')
            }

            // Refresh upcoming events to reflect bot sent status
            await fetchUpcomingEvents()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            setError(message)
            throw error
        }
    }

    const directOAuth = async () => {
        // Starts Google OAuth by redirecting to the direct-connect endpoint
        setLoading(true)
        try {
            window.location.href = '/api/auth/google/direct-connect'
        } catch {
            setError('Failed to start direct OAuth')
            setLoading(false)
        }
    }

    const getAttendeeList = (attendees: any): string[] => {
        // Normalizes attendees into a list of names/emails.
        // Accepts JSON (array or string) or comma-separated values.
        if (!attendees) {
            return []
        }

        try {
            const parsed = JSON.parse(String(attendees))
            if (Array.isArray(parsed)) {
                return parsed.map(name => String(name).trim())
            }
            return [String(parsed).trim()]
        } catch {
            const attendeeString = String(attendees)
            return attendeeString.split(',').map(name => name.trim()).filter(Boolean)
        }
    }

    const getInitials = (name: string): string => {
        // Builds up to two-letter initials from a full name
        return name
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .slice(0, 2)
    }

    return {
        userId,
        upcomingEvents,
        pastMeetings,
        loading,
        pastLoading,
        connected,
        error,
        botToggles,
        initialLoading,
        fetchUpcomingEvents,
        fetchPastMeetings,
        toggleBot,
        sendBot,
        directOAuth,
        getAttendeeList,
        getInitials
    }

}