import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clampSwipe, SWIPE_ACTION_WIDTH, swipeReleaseTarget, type SwipeSide } from './thread-swipe';

type Props={
 children:React.ReactNode;
 accent:string;
 danger:string;
 disabled:boolean;
 selected:boolean;
 openSide:SwipeSide|null;
 pinned:boolean;
 accessibilityLabel:string;
 onPress:()=>void;
 onLongPress:()=>void;
 onReveal:(side:SwipeSide|null)=>void;
 onTogglePin:()=>void;
 onArchive:()=>void|Promise<void>;
};

export function ThreadSwipeRow({children,accent,danger,disabled,selected,openSide,pinned,accessibilityLabel,onPress,onLongPress,onReveal,onTogglePin,onArchive}:Props){
 const translateX=useRef(new Animated.Value(0)).current;
 const startX=useRef(0);
 const widthRef=useRef(320);
 const [dragSide,setDragSide]=useState<SwipeSide|null>(openSide);
 const sideRef=useRef<SwipeSide|null>(openSide);
 const disabledRef=useRef(disabled);
 const openSideRef=useRef(openSide);
 disabledRef.current=disabled;
 openSideRef.current=openSide;

 const setVisualSide=(side:SwipeSide|null)=>{sideRef.current=side;setDragSide(side)};
 const settle=(target:number,side:SwipeSide|null)=>{
  setVisualSide(side);
  Animated.spring(translateX,{toValue:target,speed:25,bounciness:4,useNativeDriver:true}).start();
  onReveal(side);
 };
 const commit=(side:SwipeSide,target:number)=>{
  setVisualSide(side);
  Animated.timing(translateX,{toValue:target,duration:180,useNativeDriver:true}).start(({finished})=>{
   if(!finished)return;
   if(side==='star'){
    onTogglePin();
    translateX.setValue(0);
    setVisualSide(null);
    onReveal(null);
   }else{
    onReveal(null);
    onArchive();
   }
  });
 };

 useEffect(()=>{
  const target=disabled?0:openSide==='star'?SWIPE_ACTION_WIDTH:openSide==='archive'?-SWIPE_ACTION_WIDTH:0;
  setVisualSide(disabled?null:openSide);
  Animated.spring(translateX,{toValue:target,speed:25,bounciness:4,useNativeDriver:true}).start();
 },[disabled,openSide,translateX]);

 const panResponder=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponder:(_,gesture)=>!disabledRef.current&&Math.abs(gesture.dx)>7&&Math.abs(gesture.dx)>Math.abs(gesture.dy)*1.15,
  onPanResponderGrant:()=>{
   translateX.stopAnimation(current=>{startX.current=current});
  },
  onPanResponderMove:(_,gesture)=>{
   const value=clampSwipe(startX.current+gesture.dx,widthRef.current);
   const nextSide=value>1?'star':value<-1?'archive':null;
   if(nextSide!==sideRef.current)setVisualSide(nextSide);
   translateX.setValue(value);
  },
  onPanResponderRelease:(_,gesture)=>{
   const value=clampSwipe(startX.current+gesture.dx,widthRef.current);
   const result=swipeReleaseTarget(value,widthRef.current);
   if(result.commit&&result.side)commit(result.side,result.target);
   else settle(result.target,result.side);
  },
  onPanResponderTerminate:()=>{
   const side=openSideRef.current;
   settle(side==='star'?SWIPE_ACTION_WIDTH:side==='archive'?-SWIPE_ACTION_WIDTH:0,side);
  },
 }),[]);

 const starOpacity=translateX.interpolate({inputRange:[-1,0,1],outputRange:[0,0,1],extrapolate:'clamp'});
 const archiveOpacity=translateX.interpolate({inputRange:[-1,0,1],outputRange:[1,0,0],extrapolate:'clamp'});
 const activateAction=()=>{if(dragSide==='star')onTogglePin();else if(dragSide==='archive')onArchive();onReveal(null)};
 return <View onLayout={event=>{widthRef.current=event.nativeEvent.layout.width}} style={styles.clip}>
  <Animated.View pointerEvents="none" style={[styles.underlay,{backgroundColor:accent,opacity:starOpacity}]} />
  <Animated.View pointerEvents="none" style={[styles.underlay,{backgroundColor:danger,opacity:archiveOpacity}]} />
  {dragSide&&<Pressable accessibilityRole="button" accessibilityLabel={dragSide==='star'?(pinned?'Unstar thread':'Star thread'):'Archive thread'} onPress={activateAction} style={[styles.action,dragSide==='star'?styles.left:styles.right]}>
   <Ionicons name={dragSide==='star'?(pinned?'star':'star-outline'):'archive-outline'} color="#fff" size={21}/>
   <Text style={styles.actionText}>{dragSide==='star'?(pinned?'Unstar':'Star'):'Archive'}</Text>
  </Pressable>}
  <Animated.View {...(disabled?{}:panResponder.panHandlers)} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={disabled?'Double tap to select thread':'Swipe right to star or left to archive'} accessibilityState={{selected:disabled?selected:undefined}} accessibilityActions={disabled?[{name:'activate',label:'Select thread'}]:[{name:'activate',label:'Open thread'},{name:'star',label:pinned?'Unstar thread':'Star thread'},{name:'archive',label:'Archive thread'}]} onAccessibilityAction={event=>{switch(event.nativeEvent.actionName){case'activate':onPress();break;case'star':onTogglePin();break;case'archive':onArchive();break}}} style={{transform:[{translateX}]}}>
   <Pressable accessible={false} onPress={onPress} onLongPress={onLongPress}>{children}</Pressable>
  </Animated.View>
 </View>;
}

const styles=StyleSheet.create({
 clip:{overflow:'hidden'},
 underlay:{position:'absolute',top:0,right:0,bottom:0,left:0,borderRadius:0},
 action:{position:'absolute',top:0,bottom:0,width:SWIPE_ACTION_WIDTH,alignItems:'center',justifyContent:'center',gap:3,borderRadius:0},
 left:{left:0},
 right:{right:0},
 actionText:{color:'#fff',fontSize:12,fontWeight:'700'},
});
