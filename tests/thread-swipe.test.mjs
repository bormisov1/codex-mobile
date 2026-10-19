import assert from 'node:assert/strict';
import test from 'node:test';
import { clampSwipe, shouldCaptureSwipe, SWIPE_ACTION_WIDTH, swipeReleaseTarget } from '../src/thread-swipe.ts';

test('locks only gestures that begin with clear horizontal intent',()=>{
 assert.equal(shouldCaptureSwipe(12,3),true);
 assert.equal(shouldCaptureSwipe(-12,3),true);
 assert.equal(shouldCaptureSwipe(7,0),false);
 assert.equal(shouldCaptureSwipe(12,11),false);
 assert.equal(shouldCaptureSwipe(3,12),false);
});

test('clamps swipe translation to row width',()=>{
 assert.equal(clampSwipe(400,320),320);
 assert.equal(clampSwipe(-400,320),-320);
 assert.equal(clampSwipe(42,320),42);
});

test('reveals the action after a short directional swipe',()=>{
 assert.deepEqual(swipeReleaseTarget(40,320),{side:'star',commit:false,target:SWIPE_ACTION_WIDTH});
 assert.deepEqual(swipeReleaseTarget(-40,320),{side:'archive',commit:false,target:-SWIPE_ACTION_WIDTH});
});

test('closes a swipe below the reveal threshold',()=>{
 assert.deepEqual(swipeReleaseTarget(20,320),{side:null,commit:false,target:0});
});

test('commits the matching action after a full swipe',()=>{
 assert.deepEqual(swipeReleaseTarget(180,320),{side:'star',commit:true,target:320});
 assert.deepEqual(swipeReleaseTarget(-180,320),{side:'archive',commit:true,target:-320});
});
