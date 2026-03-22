import EmbedClient from '@/components/EmbedClient'
import { getSession } from '@/lib/getSession'
import { redirect } from 'next/navigation'
import React from 'react'

async function page() {
    const session=await getSession()
    const ownerId = session?.user?.id

    if (!ownerId) {
      redirect('/')
    }

  return (
    <>
      <EmbedClient ownerId={ownerId}/>
    </>
  )
}

export default page
