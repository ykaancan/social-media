import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ApiError, useApi, type ThreadDetail } from '../api';

export function useThread(id:string) {
  const api=useApi(),[thread,setThread]=useState<ThreadDetail|null>(null),[error,setError]=useState(false);
  const active=useRef(false),sequence=useRef(0);
  const refresh=useCallback(async()=>{
    const request=++sequence.current;
    try{const data=await api.getThread(id);if(active.current&&request===sequence.current){setThread(data);setError(false);}}
    catch(e){if(active.current&&request===sequence.current){setError(true);if(e instanceof ApiError&&[401,403,404].includes(e.status??0))setThread(null);}}
  },[api,id]);
  useFocusEffect(useCallback(()=>{
    active.current=true;setThread(null);setError(false);let stop:(()=>void)|undefined;
    const connect=()=>{stop?.();try{stop=api.subscribeThreads(()=>{void refresh();});}catch{}void refresh();};
    connect();const listener=AppState.addEventListener('change',state=>{if(state==='active'){active.current=true;connect();}else{active.current=false;sequence.current++;stop?.();stop=undefined;}});
    const timer=setInterval(()=>{if(active.current&&AppState.currentState==='active')void refresh();},5000);
    return()=>{active.current=false;sequence.current++;stop?.();listener.remove();clearInterval(timer);};
  },[api,refresh]));
  return {thread,error,refresh};
}
