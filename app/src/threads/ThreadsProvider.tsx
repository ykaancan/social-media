import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useApi, type ThreadsSnapshot } from '../api';
import { useSession } from '../session';

interface ThreadsValue { snapshot:ThreadsSnapshot|null; error:boolean; refresh:()=>Promise<void> }
const Context=createContext<ThreadsValue|null>(null);
export function ThreadsProvider({children}:{children:React.ReactNode}) {
  const api=useApi(), {me}=useSession();
  const approved=me?.status==='approved',id=me?.id;
  const [snapshot,setSnapshot]=useState<ThreadsSnapshot|null>(null),[error,setError]=useState(false);
  const sequence=useRef(0);
  const refresh=useCallback(async()=>{
    if(!approved)return;const request=++sequence.current;
    try{const data=await api.getThreads();if(request===sequence.current){setSnapshot(data);setError(false);}}
    catch{if(request===sequence.current)setError(true);}
  },[api,approved,id]);
  useEffect(()=>{
    setSnapshot(null);setError(false);if(!approved)return;
    let stop:(()=>void)|undefined;
    const connect=()=>{stop?.();try{stop=api.subscribeThreads(()=>{void refresh();});}catch{}void refresh();};
    connect();const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh();},15000);
    const listener=AppState.addEventListener('change',state=>{if(state==='active')connect();else{stop?.();stop=undefined;}});
    return()=>{sequence.current++;stop?.();clearInterval(timer);listener.remove();};
  },[api,approved,refresh]);
  const value=useMemo(()=>({snapshot,error,refresh}),[snapshot,error,refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useThreads(){const value=useContext(Context);if(!value)throw new Error('ThreadsProvider is missing');return value;}
