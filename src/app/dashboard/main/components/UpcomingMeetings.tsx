import React from 'react'
import { CalendarEvent } from '../hooks/useMeetings'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Clock, Bot } from 'lucide-react'
import { format } from 'date-fns'

interface UpcomingMeetingsProps {
    upcomingEvents: CalendarEvent[]
    connected: boolean
    error: string
    loading: boolean
    initialLoading: boolean
    botToggles: { [key: string]: boolean }
    onRefresh: () => void
    onToggleBot: (eventId: string) => void
    onSendBot: (eventId: string, meetingId: string) => Promise<void>
    onConnectCalendar: () => void
}

function UpcomingMeetings({
    upcomingEvents,
    connected,
    error,
    loading,
    initialLoading,
    botToggles,
    onRefresh,
    onToggleBot,
    onSendBot,
    onConnectCalendar
}: UpcomingMeetingsProps) {
    const [sendingBotId, setSendingBotId] = React.useState<string | null>(null)

    // Separate meetings into two groups: today and next 7 days
    const now = new Date()
    // Get today at midnight
    const todayAtMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    // Get tomorrow at midnight
    const tomorrowAtMidnight = new Date(todayAtMidnight.getTime() + 24 * 60 * 60 * 1000)
    // Get 7 days from today at midnight
    const sevenDaysFromNow = new Date(todayAtMidnight.getTime() + 7 * 24 * 60 * 60 * 1000)
    
    console.log('Upcoming events count:', upcomingEvents)
    const urgentMeetings = upcomingEvents.filter(event => {
        const eventTime = new Date(event.start?.dateTime || event.start?.date || '')
        // Show meetings happening today
        return eventTime >= todayAtMidnight && eventTime < tomorrowAtMidnight
    })

    const upcomingMeetingsNext7Days = upcomingEvents.filter(event => {
        const eventTime = new Date(event.start?.dateTime || event.start?.date || '')
        // Show meetings from tomorrow onwards up to 7 days
        return eventTime >= tomorrowAtMidnight && eventTime <= sevenDaysFromNow
    })


    const handleJoinMeeting = async (event: CalendarEvent) => {
        const botEnabled = botToggles[event.id]
        const url = event.hangoutLink || event.location

        // If bot is enabled and hasn't been sent, send it before navigating
        if (botEnabled && !event.botSent && event.meetingId) {
            setSendingBotId(event.id)
            try {
                await onSendBot(event.id, event.meetingId)
            } finally {
                setSendingBotId(null)
            }
        }

        // Navigate to the meeting
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer')
        }
    }

    const renderMeetingCard = (event: CalendarEvent) => {
        const isUrgent = urgentMeetings.some(m => m.id === event.id)
        const botEnabled = botToggles[event.id]
        const isSendingBot = sendingBotId === event.id

        return (
            <div key={event.id} className='bg-card rounded-lg p-3 border border-border hover:shadow-md transition-shadow relative'>
                <div className='absolute top-3 right-3 flex flex-col items-center justify-center gap-2'>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className='flex items-center gap-1'>
                                    <Bot className='w-4 h-4 text-muted-foreground' />
                                    <span className='text-xs text-muted-foreground'>Bot</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{botEnabled ? 'Bot enabled for this meeting' : 'Enable bot for this meeting'}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <Switch
                        checked={!!botEnabled}
                        onCheckedChange={() => onToggleBot(event.id)}
                        aria-label='Enable/disable bot for this meeting'
                        className='cursor-pointer'
                    />
                </div>
                <h4 className='font-medium text-sm text-foreground mb-2 pr-12'>{event.summary || 'No Title'}</h4>
                <div className='space-y-1 text-xs text-muted-foreground'>
                    <div className='flex items-center gap-1'>
                        <Clock className='w-3 h-3' />
                        {format(new Date(event.start?.dateTime || event.start?.date || ''), 'MMM d, h:mm a')}
                    </div>
                    {event.attendees && (
                        <div>👥 {event.attendees.length} attendees</div>
                    )}
                </div>

                {/* Show bot status text */}
                {isUrgent && botEnabled && !event.botSent && (
                    <p className='mt-2 text-xs text-green-600 font-medium'>
                        ✓ Bot will be sent when you join
                    </p>
                )}

                {(event.hangoutLink || event.location) && (
                    <Button
                        onClick={() => handleJoinMeeting(event)}
                        className='mt-2 w-full px-2 py-1 bg-primary text-primary-foreground text-xs rounded hover:bg-primary/90 transition-colors h-6 cursor-pointer'
                    >
                        Join Meeting
                    </Button>
                )}
            </div>
        )
    }

    return (
        <div>
            <div className='flex justify-between items-center mb-6'>
                <h2 className='text-xl flex flex-col gap-1 font-bold text-foreground'>Upcoming 
                </h2>
                <span className='text-sm text-muted-foreground'>({upcomingEvents.length})</span>
            </div>

            {error && (
                <div className='bg-destructive/15 border border-destructive/20 text-destructive px-4 py-3 rounded-2xl mb-6 text-sm'>
                    {error}
                </div>
            )}

            {initialLoading ? (
                <div className='bg-card rounded-lg p-6 border border-border'>
                    <div className='animate-pulse'>
                        <div className='w-12 h-12 mx-auto bg-muted rounded-full mb-3'></div>
                        <div className='h-4 bg-muted rounded w-3/4 mx-auto mb-2'></div>
                        <div className='h-3 bg-muted rounded w-1/2 mx-auto mb-4'></div>
                        <div className='h-8 bg-muted rounded w-full'></div>
                    </div>
                </div>
            ) : !connected ? (
                <div className='bg-card rounded-lg p-6 text-center border border-border'>
                    <div className='w-12 h-12 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-3'>
                        📆
                    </div>
                    <h3 className='font-semibold mb-2 text-foreground text-sm'>Connect Calendar</h3>
                    <p className='text-muted-foreground mb-4 text-xs'>
                        Connect Google Calendar to see upcoming meetings
                    </p>

                    <Button
                        onClick={onConnectCalendar}
                        disabled={loading}
                        className='w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors text-sm cursor-pointer'
                    >
                        {loading ? 'Connecting' : 'Connect Google Calendar'}
                    </Button>
                </div>
            ) : upcomingEvents.length === 0 ? (
                <div className='bg-card rounded-lg p-6 text-center border border-border'>
                    <h3 className='font-medium mb-2 text-foreground text-sm'>
                        No upcoming meetings
                    </h3>
                    <p className='text-muted-foreground text-xs '>
                        Your caledar is clear!
                    </p>
                </div>
            ) : (
                <div className='space-y-4'>
                    <Button
                        className='w-full px-3 py-2 bg-muted rounded-lg hover:bg-muted/80 disabled:opacity-50 transition-colors text-foreground text-sm cursor-pointer'
                        onClick={onRefresh}
                        disabled={loading}
                    >
                        {loading ? 'Loading...' : 'Refresh'}
                    </Button>

                    {/* Today's Meetings */}
                    {urgentMeetings.length > 0 && (
                        <div>
                            <div className='flex items-center gap-2 mb-3'>
                                <div className='h-2 w-2 rounded-full bg-red-500 animate-pulse'></div>
                                <h3 className='text-sm font-semibold text-foreground'>Today</h3>
                                <span className='text-xs text-muted-foreground'>({urgentMeetings.length})</span>
                            </div>
                            <div className='space-y-3 mb-4'>
                                {urgentMeetings.map(renderMeetingCard)}
                            </div>
                        </div>
                    )}

                    {/* Upcoming Meetings - Next 7 days */}
                    {upcomingMeetingsNext7Days.length > 0 && (
                        <div>
                            <div className='flex items-center gap-2 mb-3'>
                                <h3 className='text-sm font-semibold text-foreground'>Upcoming (next 7 days)</h3>
                                <span className='text-xs text-muted-foreground'>({upcomingMeetingsNext7Days.length})</span>
                            </div>
                            <div className='space-y-3'>
                                {upcomingMeetingsNext7Days.map(renderMeetingCard)}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default UpcomingMeetings
