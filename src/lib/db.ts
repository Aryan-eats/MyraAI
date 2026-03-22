import { connect } from "mongoose"

const mongoUrl = process.env.MONGODB_URI ?? process.env.MONGODB_URL

let cache = global.mongoose
if (!cache) {
    cache = global.mongoose = { conn: null, promise: null }
}

const connectDb = async () => {
    if (!mongoUrl) {
        throw new Error("MongoDB connection string is missing. Set MONGODB_URI in your environment.")
    }

    if (cache.conn) {
        return cache.conn
    }

    if (!cache.promise) {
        cache.promise = connect(mongoUrl).then((mongoose) => mongoose.connection)
    }

    try {
        cache.conn = await cache.promise
        return cache.conn
    } catch (error) {
        cache.promise = null
        throw error
    }
}

export default connectDb
