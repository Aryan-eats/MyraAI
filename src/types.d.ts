import { Connection } from "mongoose"
import Redis from "ioredis"

declare global{
    var mongoose:{
          conn:Connection | null,
          promise:Promise<Connection> | null
    }
    var redisClient: Redis | null | undefined
}

export {}
