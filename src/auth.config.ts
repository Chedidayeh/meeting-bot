import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"


export  default {
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            authorization: {
                params: {
                    prompt: 'consent',
                    access_type: 'offline',
                    response_type: 'code',
                    scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events.readonly',
                },
            },
        }),
        // Credentials({
        //     async authorize(credentials) {
        //         const validatedFields = LoginSchema.safeParse(credentials)

        //         if(validatedFields.success){
        //             const {email , password } = validatedFields.data

        //             const user = await getUserByEmail(email)
        //             if(!user || !user.password){
        //                 return null;
        //             }
        //             const passwordMatch = await bcrypt.compare(
        //                 password,
        //                 user.password,
        //             );

        //             if(passwordMatch) return user;
        //         }
        //         return null
        //     }
        // })
    ],
} satisfies NextAuthConfig