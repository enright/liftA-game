# lifta-game

## Quest for Sushi
This is an example prototype game created using liftA. The main purpose is to demonstrate construction and running of arrows. You can see how to create arrows than run in series and in parallel. liftA-syntax is used for fluent syntax. liftA-node contains arrows for working with EventEmitter.

## Using lifta-syntax and liftA-Node:

```javascript
// Yay! Arrows!
var lifta = require('lifta-syntax');
// syntatic convenience
const constA = lifta.constA;
const justRepeatA = lifta.justRepeatA;

var liftaNode = require('liftA-node');
const eventA = liftaNode.eventA;
const eventPropertyA = liftaNode.eventPropertyA;
```

## Some things to note about the code above:

We create a number of different kinds of arrows and them combine then into a single arrow - a single function. Examples are:

### A countdown arrow which listens to a tick, decreases a counter, and messages the client
```Javascript
    // [undefined, { emitter, game, ticksInGame, clock, p }]
    // simple countdown
    function countdown(x) {
      console.log('countdown ', x.second.ticksInGame - x.first.tick);
      x.second.game.server_setCountdown({
        ticks: ticksInGame - x.first.tick
      });
      return x;
    }

    var countDownA =
      ((x) => {
        return freeze([freeze({
          emitter: x.second.emitter,
          name: 'tick'
        }), x.second]);
      })
      .then(liftaNode.eventEmitterA.first)
      .then(countdown)
      .then(justRepeatA)
      .repeat;
```
countDownA first transforms the tuple "x" by replacing x.first with the data needed for the eventEmitterA arrow (which only uses the first of the tuple). The countdown() function is "tuple-aware". It uses the result of the eventEmitterA (x.first.tick) to set the countdown given to the client.
This arrow is always repeated, but it actually doesn't go on forever. The timeout arrow below cancels all in-progress arrows (represented by 'p') when the game times out.

### A "timeout" arrow which terminates the game
```Javascript
    function gameOver(x) {
      console.log('it is game over!');
      // tell the user it's over
      x.game.server_sendMessage('Time has run out!');
      // play a 'losing' sound here!
      x.game.server_playSound({
        name: 'win.m4a',
        gain: 0.5
      });
      // cancel all arrows
      x.p.cancelAll();
      // cancel the tick interval on the emitter
      x.clock.stop();
      return x;
    }

    // listen for the tick value equal to ticks in game
    var timeoutGameA =
      ((x) => freeze([freeze({
        emitter: x.second.emitter,
        name: 'tick',
        property: 'tick',
        value: x.second.ticksInGame
      }), x.second]))
      .then(liftaNode.eventPropertyEmitterA.first)
      .then(gameOver.second);
```

timeoutGameA first prepares the eventPropertyEmitterA with the event name and a property name and value to look for on the object sent with the event. eventPropertyEmitterA will not complete until 'tick' value is equal to the ticks allocated for the game. When this event happens, gameOver.second uses the second of the tuple to run the gameOver function, which informs the user the game is over, cancels any in-progress arrows (such as the countDownA above), and turns off the game clock.
