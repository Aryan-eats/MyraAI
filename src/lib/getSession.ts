import { cookies } from "next/headers";
import { scalekit } from "@/lib/ScaleKit";

export async function getSession(){
    const session=await cookies()
    const token=session.get("myra_session")?.value ?? session.get("access_token")?.value
    if(!token){
        return null
    }
    try {
         const result = await scalekit.validateToken<{ sub: string }>(token)
          const user=await scalekit.user.getUser(result.sub)
          return user
    } catch (error) {
        console.log(error)
    }
  


}
