'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader } from 'lucide-react';

const Redirecting = () => {
  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => {
      router.replace("/"); // client-side redirect
    }, 1000); // optional delay to show animation
    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <AlertDialog open={true}>
      <AlertDialogContent className="rounded-xl max-w-[80%] sm:max-w-[60%] md:max-w-[40%] xl:max-w-[30%]">
        <AlertDialogHeader className="flex flex-col items-center">
          <AlertDialogTitle className="text-xl text-blue-700 font-bold text-center">
            redirecting
          </AlertDialogTitle>
          <AlertDialogDescription className="flex flex-col items-center">
            pleaseWait
            <Loader className="text-blue-700 h-5 w-5 animate-spin mt-3" />
          </AlertDialogDescription>
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default Redirecting;
