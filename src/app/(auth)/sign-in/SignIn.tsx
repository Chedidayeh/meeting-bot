'use client'
import NextImage from "next/image"
import * as React from "react"
import { Button } from "@/components/ui/button"

import { GoogleLogin } from "./actions"
import {
  Card,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const SignIn = () => {








  const handleClick = async () => {
    try {
      await GoogleLogin();
    } catch (error) {
      console.error("An error occurred during Google Login:", error);
    }
  };



  return (
    <>




      <div className='relative flex mt-32 pb-10 flex-col items-center justify-center lg:px-0 lg:mb-36 mb-44'>
        <Card className=' flex w-[350px] flex-col justify-center sm:w-[450px]'>
          <CardHeader className="flex flex-col items-center space-y-3 text-center">
            <CardTitle className='text-lg font-semibold tracking-tight'>
              sign_in_to_your
              account
            </CardTitle>
            <div className="mt-6">
              <Button className="text-xs gap-2 border animate-borderPulse" onClick={handleClick} variant={"outline"} style={{ display: 'flex', alignItems: 'center' }}>
                <NextImage
                  src="/gcal.png"
                  alt="google"
                  width={24}
                  height={24}
                  style={{ marginRight: '8px' }}
                />
                sign_in_with_google
              </Button>
            </div>

          </CardHeader>




        </Card>
      </div>



    </>
  )
}

export default SignIn