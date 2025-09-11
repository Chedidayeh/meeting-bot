import { getUserId } from '@/actions/user/actions'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const  userId  = await getUserId()
        if (!userId) {
            return NextResponse.json({ error: 'unautorized' }, { status: 401 })
        }

        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ error: 'no file provided' }, { status: 400 })
        }

        const fileExtension = file.name.split('.').pop()
        const objectPath = `${userId}/${Date.now()}.${fileExtension}`

        const buffer = Buffer.from(await file.arrayBuffer())

        const { error: uploadError } = await supabase
            .storage
            .from('bot-avatars')
            .upload(objectPath, buffer, {
                contentType: file.type,
                upsert: true
            })

        if (uploadError) {
            console.error('supabase upload error:', uploadError)
            return NextResponse.json({ error: 'failed to upload image' }, { status: 500 })
        }

        const { data: publicData } = supabase
            .storage
            .from('bot-avatars')
            .getPublicUrl(objectPath)

        const publicUrl = publicData?.publicUrl

        return NextResponse.json({
            success: true,
            url: publicUrl
        })

    } catch (error) {
        console.error('avatar upload error:', error)
        return NextResponse.json({ error: 'failed to upload image' }, { status: 500 })
    }
}