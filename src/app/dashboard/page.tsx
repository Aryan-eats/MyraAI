import DashboardClient from '@/components/DashboardClient'
import { getSession } from '@/lib/getSession'
import { redirect } from 'next/navigation'
import React from 'react'

export const dynamic = "force-dynamic"

async function page() {
    const session=await getSession()
    const ownerId = session?.user?.id

    if (!ownerId) {
      redirect('/')
    }
       
  return (
    <>
      <DashboardClient ownerId={ownerId}/>
    </>
  )
}

export default page
