import {type NextFunction, type Request, type Response } from "express";
import { createSupabaseClient } from "./client";
import { prisma } from "./db";


const client = createSupabaseClient()

export async function middleware(req: Request, res: Response, next: NextFunction) {

    const token = req.headers.authorization

    const data = await client.auth.getUser(token)
    const userId = data.data.user?.id
    if (userId) {
        try{
            await prisma.user.create({
            data :{
                email : data.data.user?.email!,
                provider : data.data.user?.app_metadata.provider === 'google' ? "Google" : "Github",
                name : data.data.user?.user_metadata.full_name,
                id : data.data.user!.id,
                supabaseId : data.data.user!.id

            }
        })
        } catch(e){
            
        }
        req.userId = userId
        next()
    }
    else {
        res.status(401).json({ message: "Unauthorized" })
    }

}
