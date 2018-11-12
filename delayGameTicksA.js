/*
The MIT License (MIT)

Copyright (c) 2013-2018 Bill Enright

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
"use strict";

let freeze = Object.freeze;

// construct an arrow with an emitter that has
// a gameTick property (current game tick)
// and an event called 'tick'
// incoming x should be number of ticks to delay
// continue with the event when tick fires and delay has been met
let delayGameTicksA = (x, cont, p) => {
  let {
    emitter,
    clock
  } = x.second;
  let cancelId;
  let delayTicks = x.first;
  let beginTick = clock.gameTick();

  let listener = (e) => {
    if (beginTick + delayTicks < e.tick) {
      emitter.removeListener('tick', listener);
      p.advance(cancelId);
      return cont(freeze([freeze(e), x.second]), p);
    }
  };

  emitter.addListener('tick', listener);
  cancelId = p.add(() => emitter.removeListener('tick', listener));
};

module.exports = delayGameTicksA;