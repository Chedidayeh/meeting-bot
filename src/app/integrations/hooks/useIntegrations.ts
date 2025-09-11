/* eslint-disable @typescript-eslint/no-explicit-any */
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"

// useIntegrations
// -----------------
// React hook that manages the list of third‑party integrations available to the
// user (Slack, Trello, Jira, Asana, Google Calendar). It:
// - Fetches current connection status and metadata for each integration
// - Handles OAuth/connect and disconnect flows
// - Supports a post‑auth "setup" step for some platforms (e.g., select board/channel)
// - Exposes state and helpers for an Integrations UI page

// Describes the shape of an integration item displayed in the UI
export interface Integration {
    platform: 'google-calendar' | 'trello' | 'jira' | 'asana' | 'slack'
    name: string
    description: string
    connected: boolean
    boardName?: string
    projectName?: string
    channelName?: string
    logo: string
}

export function useIntegrations() {
    const session  = useSession()
    const userId = session?.data?.user.id

    // Local list of integrations with default (disconnected) state and static metadata
    const [integrations, setIntegrations] = useState<Integration[]>([
        {
            platform: 'slack',
            name: 'Slack',
            description: 'Post meeting summaries to your Slack channels',
            connected: false,
            channelName: undefined,
            logo: '/slack.png'
        },
        {
            platform: 'trello',
            name: 'Trello',
            description: 'Add action items to your Trello boards',
            connected: false,
            logo: '/trello.png'
        },
        {
            platform: 'jira',
            name: 'Jira',
            description: 'Create tickets for development tasks and more',
            connected: false,
            logo: '/jira.png'
        }, {
            platform: 'asana',
            name: 'Asana',
            description: 'Sync tasks with your team projects',
            connected: false,
            logo: '/asana.png'
        },
        {
            platform: 'google-calendar',
            name: 'Google Calendar',
            description: 'Auto-Sync meetings',
            connected: false,
            logo: '/gcal.png'
        }
    ])

    // UI/async state
    // - loading: overall integrations status loading
    // - setupMode: which platform is currently in the setup step (if any)
    // - setupData: server-provided data to drive the setup UI (e.g., lists)
    // - setupLoading: POSTing/saving the setup config
    const [loading, setLoading] = useState(true)
    const [setupMode, setSetupMode] = useState<string | null>(null)
    const [setupData, setSetupData] = useState<any>(null)
    const [setupLoading, setSetupLoading] = useState(false)

    useEffect(() => {
        // When a user is authenticated, fetch the current integration statuses
        if (userId) {
            fetchIntegrations()
        }

        // Support deep‑link back to setup after OAuth redirects, e.g. ?setup=trello
        const urlParams = new URLSearchParams(window.location.search)
        const setup = urlParams.get('setup')
        if (setup && ['trello', 'jira', 'asana', 'slack'].includes(setup)) {
            setSetupMode(setup)
            fetchSetupData(setup)
        }
    }, [userId])


    const fetchIntegrations = async () => {
        try {
            // Fetch non-calendar integrations status from a consolidated endpoint
            const response = await fetch('/api/integrations/status')
            const data = await response.json()

            // Google Calendar connection is tracked via a separate endpoint
            const calendarResponse = await fetch('/api/user/calendar-status')
            const calendarData = await calendarResponse.json()

            // Merge server status into our local list by platform
            setIntegrations(prev => prev.map(integration => {
                if (integration.platform === 'google-calendar') {
                    return {
                        ...integration,
                        connected: calendarData.connected || false
                    }
                }

                const status = data.find((d: any) => d.platform === integration.platform)
                return {
                    ...integration,
                    connected: status?.connected || false,
                    boardName: status?.boardName,
                    projectName: status?.projectName,
                    channelName: status?.channelName
                }
            }))
        } catch (error) {
            console.error('error fetching integrations:', error)
        } finally {
            setLoading(false)
        }
    }

    // Fetch per‑platform setup data (e.g., available boards/projects/channels)
    const fetchSetupData = async (platform: string) => {
        try {
            const response = await fetch(`/api/integrations/${platform}/setup`)
            const data = await response.json()
            setSetupData(data)
        } catch (error) {
            console.error(`Error fetching ${platform} setup data:`, error)
        }
    }

    // Start OAuth or direct connection flow for a platform
    const handleConnect = (platform: string) => {
        if (platform === 'slack') {
            // Slack install flow (with return target for after-install redirect)
            window.location.href = '/api/slack/install?return=integrations'
        } else if (platform === 'google-calendar') {
            // Direct Google auth connection
            window.location.href = '/api/auth/google/direct-connect'
        } else {
            // Generic integrations OAuth entry point
            window.location.href = `/api/integrations/${platform}/auth`
        }
    }

    // Disconnect a platform and refresh local state
    const handleDisconnect = async (platform: string) => {
        try {
            if (platform === 'google-calendar') {
                await fetch('/api/auth/google/disconnect', {
                    method: 'POST'
                }
                )
            } else {
                await fetch(`/api/integrations/${platform}/disconnect`, {
                    method: 'POST'
                })
            }
            fetchIntegrations()
        } catch (error) {
            console.error('error disconnecting:', error)
        }
    }

    // Submit a platform's setup configuration (e.g., chosen board/channel)
    const handleSetupSubmit = async (platform: string, config: any) => {
        setSetupLoading(true)
        try {
            const response = await fetch(`/api/integrations/${platform}/setup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            })
            if (response.ok) {
                // Clear setup state, refresh integration statuses, and clean URL
                setSetupMode(null)
                setSetupData(null)

                fetchIntegrations()
                window.history.replaceState({}, '', '/integrations')
            }
        } catch (error) {
            console.error('error saving setup:', error)
        } finally {
            setSetupLoading(false)
        }
    }

    // Public API for consumers (Integrations page/components)
    return {
        integrations,
        loading,
        setupMode,
        setSetupMode,
        setupData,
        setSetupData,
        setupLoading,
        setSetupLoading,
        fetchIntegrations,
        fetchSetupData,
        handleConnect,
        handleDisconnect,
        handleSetupSubmit
    }
}