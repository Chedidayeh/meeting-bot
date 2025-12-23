/* eslint-disable react/no-unescaped-entities */
'use client'

import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function NotFound() {
    return (
        <div className='min-h-screen bg-background flex items-center justify-center'>
            <div className='text-center max-w-md mx-auto px-6'>
                <div className='mb-8'>
                    <h1 className='text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/50 mb-4'>
                        404
                    </h1>
                    <h2 className='text-3xl font-bold text-foreground mb-3'>
                        Page Not Found
                    </h2>
                    <p className='text-muted-foreground text-lg leading-relaxed'>
                        The page you're looking for doesn't exist. It may have been moved or deleted.
                    </p>
                </div>

                <div className='space-y-3'>
                    <Link href="/dashboard/main" className='block w-full'>
                        <Button className='w-full bg-primary hover:bg-primary/90' size='lg'>
                            Go to Dashboard
                        </Button>
                    </Link>

                    <Link href="/" className='block w-full'>
                        <Button variant='outline' className='w-full' size='lg'>
                            Go to Home
                        </Button>
                    </Link>

                </div>
            </div>
        </div>
    )
}
