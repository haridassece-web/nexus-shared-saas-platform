import {supabase} from "./supabase";
const base=import.meta.env.VITE_API_URL||"http://localhost:4000";
export async function api<T>(path:string,options:RequestInit={},businessId?:string):Promise<T>{
 const {data:{session}}=await supabase.auth.getSession();
 const headers:Record<string,string>={"Content-Type":"application/json"};
 if(session?.access_token)headers.Authorization=`Bearer ${session.access_token}`;
 if(businessId)headers["x-business-id"]=businessId;
 Object.assign(headers,options.headers||{});
 const r=await fetch(`${base}${path}`,{...options,headers});
 const body=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(body.error||"Request failed");
 return body as T;
}
