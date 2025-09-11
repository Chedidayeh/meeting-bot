'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, Loader2 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import React, { useState } from 'react'

const plans = [
    {
        id: 'free',
        name: 'Free',
        price: 0,
        description: 'Perfect for trying out the service',
        features: [
            'No meetings allowed',
            'No AI chat messages',
            'Basic features only'
        ],
        popular: false
    },
    {
        id: 'starter',
        name: 'Starter',
        price: 9,
        description: 'Perfect for people getting started',
        features: [
            '10 meetings per month',
            '30 AI chat messages per day',
            'Meeting transcripts and summaries',
            'Action items extraction',
            'Email Notifications'
        ],
        popular: false
    },
    {
        id: 'pro',
        name: 'Pro',
        price: 29,
        description: 'Perfect for people growing who need more power',
        features: [
            '30 meetings per month',
            '100 AI chat messages per day',
            'Meeting transcripts and summaries',
            'Action items extraction',
            'Email Notifications',
            'Priority Support'
        ],
        popular: true
    },
    {
        id: 'premium',
        name: 'Premium',
        price: 99,
        description: 'Perfect for people who need unlimited limits',
        features: [
            'Unlimited meetings per month',
            'Unlimited AI chat messages per day',
            'Meeting transcripts and summaries',
            'Action items extraction',
            'Email Notifications',
            'Priority Support'
        ],
        popular: false
    }
]

function Pricing() {
    const session = useSession()
    const user = session?.data?.user
    const [loading, setLoading] = useState<string | null>(null)

    const handlePlanSwitch = async (planName: string) => {
        if (!user) {
            return
        }

        setLoading(planName)

        try {
            const response = await fetch('/api/user/switch-plan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    planName
                })
            })

            const data = await response.json()

            if (data.success) {
                // Show success message and refresh the page to update UI
                alert(`Successfully switched to ${planName} plan!`)
                window.location.reload()
            } else {
                throw new Error(data.error || 'Failed to switch plan')
            }
        } catch (error) {
            console.error('Plan switching error:', error)
            alert('Failed to switch plan. Please try again.')
        } finally {
            setLoading(null)
        }
    }

    return (
        <div className='container mx-auto px-6 2xl:max-w-[1400px] py-16'>
            <div className='max-w-2xl mx-auto text-center mb-14'>
                <h2 className='text-3xl font-semibold tracking-tight transition-colors first:mt-0 mb-6'>
                    Choose Your <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600  bg-clip-text text-transparent">Plan</span>
                </h2>
                <p className="text-lg max-w-2xl mx-auto mb-8 bg-gradient-to-r from-gray-300 to-gray-500 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(156,163,175,0.3)]">
                    Automatic summaries, action items, and intelligent insights for every meeting.
                    Never miss important details again.
                </p>

            </div>

            <div className='mt-12 grid grid-cols-4 gap-6 items-center'>
                {plans.map((plan) => {
                    const isLoading = loading === plan.id

                    return (
                        <Card
                            key={plan.id}
                            className={`relative overflow-visible flex flex-col ${plan.popular ? 'border-blue-500' : ''}`}
                        >
                            {plan.popular && (
                                <Badge className='absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 text-white'>
                                    Most Popular
                                </Badge>
                            )}

                            <CardHeader className='text-center pb-2'>
                                <CardTitle className='mb-7'>{plan.name}</CardTitle>
                                <span className='font-bold text-5xl'>
                                    {plan.price === 0 ? 'Free' : `$${plan.price}`}
                                </span>
                            </CardHeader>

                            <CardDescription className='text-center w-11/12 mx-auto'>
                                {plan.description}
                            </CardDescription>

                            <CardContent className='flex-1'>
                                <ul className='mt-7 space-y-2.5 text-sm'>
                                    {plan.features.map((feature, index) => (
                                        <li key={index} className='flex space-x-2'>
                                            <Check className='flex-shrink-0 mt-0.5 h-4 w-4' />
                                            <span className='text-muted-foreground'>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>

                            <CardFooter>
                                <Button
                                    className={`w-full cursor-pointer ${plan.popular
                                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:opacity-90 hover:scale-[0.98] transition-all duration-150'
                                        : ''
                                        }`}
                                    variant={plan.popular ? 'default' : 'outline'}
                                    onClick={() => handlePlanSwitch(plan.id)}
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className='w-5 h-5 mr-2 animate-spin' />
                                            Switching...
                                        </>
                                    ) : (
                                        `Switch to ${plan.name}`
                                    )}
                                </Button>
                            </CardFooter>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}

export default Pricing
