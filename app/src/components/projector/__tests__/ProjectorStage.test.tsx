import React from 'react';
import { act, configure, fireEvent, render, screen } from '@testing-library/react-native';
import { ProjectorStage } from '../ProjectorStage';
import { EventColorProvider, ThemeProvider } from '../../../theme';
import { initI18n } from '../../../i18n';
import type { BoardPost } from '../../../api/board';

initI18n();configure({defaultIncludeHiddenElements:true});
const posts:BoardPost[]=['First published post','Second published post'].map((text,index)=>({
  id:String(index),text,sender:{level:'anonymous'},createdAt:new Date(0).toISOString(),state:'approved',mine:false,reactions:{},
}));
it('advances published posts, pauses, and offers an exit without write actions',async()=>{
  jest.useFakeTimers();const exit=jest.fn();
  try {
    await render(<ThemeProvider><EventColorProvider><ProjectorStage name="Event" posts={posts} status="live" onExit={exit}/></EventColorProvider></ThemeProvider>);
    expect(screen.getByText('First published post')).toBeTruthy();
    await act(async()=>{jest.advanceTimersByTime(8000);});
    expect(screen.getByText('Second published post')).toBeTruthy();
    await fireEvent.press(screen.getByText('Pause'));
    await act(async()=>{jest.advanceTimersByTime(16000);});
    expect(screen.getByText('Second published post')).toBeTruthy();
    expect(screen.queryByLabelText('Reply privately')).toBeNull();expect(screen.queryByLabelText('React')).toBeNull();
    await fireEvent.press(screen.getByText('Exit projector'));expect(exit).toHaveBeenCalledTimes(1);
  } finally {jest.useRealTimers();}
});
