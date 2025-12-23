
import authConfig from "./auth.config";
import NextAuth from "next-auth";
const PROTECTED_ROUTES = ['/dashboard/main', '/dashboard/settings' , '/dashboard/meeting/:path*' , '/dashboard/integrations' , '/dashboard/chat' , '/dashboard/pricing' , '/api/auth/logout']
import { auth as a } from '@/auth'
const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
    const { nextUrl } = req
    const isProtected = PROTECTED_ROUTES.some((path) => nextUrl.pathname.startsWith(path))
    const session = await a()
    if (isProtected && !session) {
        return Response.redirect(new URL("/", nextUrl))

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