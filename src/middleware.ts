
import authConfig from "./auth.config";
import NextAuth from "next-auth";
const PROTECTED_ROUTES = ['/dashboard', '/forum']
import { auth as a } from '@/auth'
const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
    const { nextUrl } = req
    const isProtected = PROTECTED_ROUTES.some((path) => nextUrl.pathname.startsWith(path))
    const session = await a()
    if (isProtected && !session) {
        const signInUrl = new URL('/api/auth/signin', nextUrl.origin)
        signInUrl.searchParams.set('callbackUrl', nextUrl.href)
        return Response.redirect(signInUrl)
    }
})

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
}