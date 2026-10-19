export const SWIPE_ACTION_WIDTH = 92;

export type SwipeSide = 'star' | 'archive';

export function clampSwipe(value:number,width:number){
 return Math.max(-width,Math.min(width,value));
}

export function swipeReleaseTarget(value:number,width:number){
 const commitDistance=Math.max(150,width*.55);
 if(value>=commitDistance)return {side:'star' as const,commit:true,target:width};
 if(value<=-commitDistance)return {side:'archive' as const,commit:true,target:-width};
 if(value>=SWIPE_ACTION_WIDTH*.42)return {side:'star' as const,commit:false,target:SWIPE_ACTION_WIDTH};
 if(value<=-SWIPE_ACTION_WIDTH*.42)return {side:'archive' as const,commit:false,target:-SWIPE_ACTION_WIDTH};
 return {side:null,commit:false,target:0} as const;
}
