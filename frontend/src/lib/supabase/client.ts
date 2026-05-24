import {createBrowserClient} from '@supabase/ssr'
import { PUBLISHABLE_SECRET } from '../../../const'

export function createClient(){
    return createBrowserClient(
        "https://eakjfqncfosodfhkphdu.supabase.co",
        PUBLISHABLE_SECRET
    )
}