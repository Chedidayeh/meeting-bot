import {PrismaAdapter} from "@auth/prisma-adapter"
import { db } from "@/db"
import NextAuth, { type DefaultSession } from "next-auth"
import { JWT } from "next-auth/jwt"
import authConfig from "./auth.config"
import { getUserById } from "./actions/user/actions"
// Extend the `Session` interface to include `role` and `id`
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

 
// declare module "next-auth/jwt" {
//   interface JWT {
//   }
// }




export const { handlers, signIn, signOut, auth } = NextAuth({
  callbacks: {
    async session({ token,session }) {
      if(token.sub && session.user){
        session.user.id = token.sub
      }



      return session
    },
    async jwt ({token , trigger , session   }) {
      if(!token.sub) return token
      // Note: Removed Prisma call from JWT callback to avoid edge runtime issues
      return token
    },
  },
  adapter : PrismaAdapter(db),
  session : {strategy : "jwt" , 
  },
  ...authConfig,
})