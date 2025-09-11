/* eslint-disable @next/next/no-img-element */
/* eslint-disable react/no-unescaped-entities */
import * as React from "react"

import SignIn from "./SignIn"
import { getUser } from "@/actions/user/actions"
import RedirectingToHomePage from "@/components/RedirectingToHomePage"

const Page = async () => {



  const user = await getUser()
  
  if (user) return <RedirectingToHomePage/>

  


  return (
    <SignIn/>
  )
}

export default Page