# lifta-game

## Quest for Sushi
This is an example prototype game created using liftA. The main purpose is to demonstrate construction and running of arrows. You can see how to create arrows than run in series and in parallel. liftA-syntax is used for fluent syntax. liftA-node contains arrows for working with EventEmitter.

```
git clone git@github.com:enright/liftA-game.git
cd lifta-game
npm install
node appWithKeyAndChest
```
Then point your browser at http://localhost:3000/game1

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

### Flexibility with tuples (a tuple of tuples!) shows how we can both share data and carry different data structures through a tricky composition
```Javascript
    var boardTileChangesA =
      // split into two tuples, one for delays, one for board changes
      ((x) => freeze([
        [undefined, x.second],
        [boardChanges, x.second]
      ]))
      .then(
        // wait 4 ticks
        constA(4).first.then(delayGameTicksA).first
        // then change the tiles
        .then(boardTileChange.second)
        // wait 6 ticks
        .then(constA(6).first.then(delayGameTicksA).first)
        // and change them back
        .then(boardTileChange.second)
        // repeat this forever
        .then(justRepeatA)
        .repeat
      );
```

We need to accomplish some animation in our game. A particular area of the game board actually changes over time in a cycle. We take the incoming data and create two tuples, sharing x.second (which is typically contextual data that does not change frequently). The first tuple is used for delay arrows (delaying for 4 and 6 ticks). Since this value comes from a constant arrow, we can simply initialize to undefined. The second tuple - [boardChanges, x.second] - contains the initial board changes. Note that each call to boardTileChange.second in the composite arrow returns a new tuple. boardChangeTiles actually returns the values _of the replaced board tiles_. So each time it is called in our composite arrow, the previous board tiles are restored. Since it repeats, we cycle between two sets of board tiles every four and six seconds.

### It all comes together

```Javascript
    let p = lifta.P();
    let runTheGame =
      // wait for the start event, then start
      eventA.then(startGameA)
      .then(
        countDownA
        .fan(timeoutGameA)
        .fan(playerMovementA)
        .fan(takePrizesA)
        .fan(boardTileChangesA)
        .fan(chestAndKeyA)
      );
    runTheGame(freeze([freeze({
      name: 'start-game'
    }), freeze({
      emitter,
      game,
      clock,
      ticksInGame,
      p
    })]), () => { /* log game termination */ }, p);
  }
```
We create the progress canceller which we will add to the context (because the timeoutA arrow uses it to cancel everything when the game ends). The game arrow is constructed with an initialize step (startGameA) followed by fanning of all the arrows to run in parallel. Simple! The runTheGame call creates the initial data which gives the name of the start game event as x.first, and the node event emitter, the game object, the clock, the length of the game and the canceller - all the context - in x.second. Note that p must be passed in - running arrows use it to provide cancellers for all "in-flight" arrows.
