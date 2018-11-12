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
/**
 * Module dependencies.
 */
var events = require('events');
var express = require('express');
var http = require('http');
var path = require('path');

// Yay! Arrows!
var lifta = require('lifta-syntax');
// syntatic convenience
const constA = lifta.constA;
const justRepeatA = lifta.justRepeatA;

var liftaNode = require('liftA-node');
const eventA = liftaNode.eventA;
const eventPropertyA = liftaNode.eventPropertyA;

var delayGameTicksA = require('./delayGameTicksA');

// we want sockets for browser/server communication
// and we want imghex for generation of hex tiles in browser ui
var socketio = require('socket.io');
var imghex = require('imghex');

const freeze = Object.freeze;

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));

// serve up board tiles from the url /boardTiles...redirect it to /views/boardTiles
app.use('/tileImages', express.static(__dirname + '/public/images/tileImages'));
app.use('/pieceImages', express.static(__dirname + '/public/images/pieceImages'));
app.use('/prizeImages', express.static(__dirname + '/public/images/prizeImages'));
app.use('/sounds', express.static(__dirname + '/public/sounds'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.cookieParser('your secret here'));
app.use(express.session());
app.use(app.router);


// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/test', function (req, res) {
  res.send('ouch');
});

function createGameIo(io, id, game) {
  var gameIo = {};

  // get rid of the old one if we've got the same id
  if (io.namespaces[id] !== undefined) {
    delete io.namespaces[id];
  }

  // creat a namespace for the game
  gameIo.namespace = io.of(id);

  // set up incoming message handlers on socket on connect
  gameIo.namespace.on('connection', function (socket) {
    socket.emit('text-message', 'Welcome to Quest 4 Sushi!');
    game.connected(socket);
    socket.on('start-game', game.startGame);
    socket.on('move-to', game.moveTo);
  });

  return gameIo;
}

var gameClockCancellers = {};

function createGame(id) {
  var game = {},
    emitter = new events.EventEmitter(),
    tickCanceller,
    ticksInGame = 90, // 90 second games
    progress; // arrows canceller

  game.pieces = [{
    rank: 0,
    file: 0,
    src: "pieceImages/sumo-wrestler.png",
    prizePoints: 0
  }];
  game.prizes = [{
      rank: 2,
      file: 3,
      src: "prizeImages/Sushi.png",
      coins: 100
    },
    {
      rank: 6,
      file: 5,
      src: "prizeImages/miso-soup.png",
      coins: 50
    },
    {
      rank: 10,
      file: 9,
      src: "prizeImages/bonsai.png",
      coins: 75
    },
    {
      rank: 12,
      file: 14,
      src: "prizeImages/Sushi.png",
      coins: 100
    },
    {
      rank: 7,
      file: 2,
      src: "prizeImages/Key.png"
    },
    {
      rank: 11,
      file: 13,
      src: "prizeImages/Chest-Closed.png"
    },
  ];
  game.tiles = [{
      rank: 3,
      file: 10,
      src: "tileImages/water.png"
    },
    {
      rank: 4,
      file: 10,
      src: "tileImages/water.png"
    },
    {
      rank: 3,
      file: 11,
      src: "tileImages/water.png"
    },
    {
      rank: 2,
      file: 10,
      src: "tileImages/water.png"
    }
  ];
  game.canTakeChest = false;

  let clock = ((emitter, id) => {
    let tick = 0;

    function gameTick() {
      return tick;
    }

    function reset() {
      tick = 0;
    }

    function stop() {
      clearInterval(gameClockCancellers[id]);
    }

    // start the game clock ticking (or resume it)
    function start() {
      var canceller = setInterval(function () {
        tick += 1;
        emitter.emit('tick', {
          tick
        });
      }, 1000);
      gameClockCancellers[id] = canceller;
    }
    return freeze({
      gameTick,
      reset,
      stop,
      start
    });
  })(emitter, id);

  function createAndRunArrows() {
    // [undefined, { emitter, game, ticksInGame, clock, p }]
    // simple countdown
    function countdown(x) {
      console.log('countdown ', x.second.ticksInGame - x.first.tick);
      x.second.game.server_setCountdown({
        ticks: ticksInGame - x.first.tick
      });
      return x;
    }

    // just repeat the countdown forever
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

    // gameover function sends message, cancels all arrows, stops emitter tick
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


    function onAPrize(game, rank, file) {
      var i, length = game.prizes.length;
      for (i = 0; i < length; i += 1) {
        if (game.prizes[i].rank === rank && game.prizes[i].file === file) {
          return game.prizes[i];
        }
      }
      return undefined;
    }

    function moveThePlayer(x) {
      let {
        rank,
        file
      } = x.first;
      let {
        emitter,
        game
      } = x.second;

      // is there a prize here? ensure rank and file are numbers
      let prize = onAPrize(game, rank * 1, file * 1);
      if (prize) {
        // take the prize
        emitter.emit('take-prize', prize);
      }

      // move the player
      game.pieces[0].rank = rank;
      game.pieces[0].file = file;
      game.server_movePlayer(game.pieces[0]);
      return x;
    }
    // for starters, let the user move wherever they want, whenever
    var playerMovementA =
      ((x) => {
        return freeze([freeze({
          emitter: x.second.emitter,
          name: 'request-move-to'
        }), x.second]);
      })
      .then(liftaNode.eventEmitterA.first)
      .then(moveThePlayer)
      .then(justRepeatA)
      .repeat;

    function removeAPrize(rank, file) {
      var i, length = game.prizes.length;
      for (i = 0; i < length; i += 1) {
        if (game.prizes[i].rank === rank && game.prizes[i].file === file) {
          game.prizes.splice(i, 1);
          return;
        }
      }
    }

    function takePrize(x) {
      let eventData = x.first;
      let game = x.second.game;
      game.pieces[0].prizePoints += eventData.coins || 0;
      game.server_setPoints(game.pieces[0].prizePoints);
      game.server_playSound({
        name: 'boo',
        gain: 0.3
      });
      removeAPrize(eventData.rank, eventData.file);
      game.server_removePrize(eventData);
      return x;
    }

    // build a prize arrow
    function buildPrizeA(prize) {
      return constA(freeze(prize)).first
        .then(eventPropertyA)
        .then(takePrize)
        .then(justRepeatA)
        .repeat;
    }

    var sushiPrizeA = buildPrizeA({
      name: 'take-prize',
      property: 'src',
      value: 'prizeImages/Sushi.png'
    });

    var misoPrizeA = buildPrizeA({
      name: 'take-prize',
      property: 'src',
      value: 'prizeImages/miso-soup.png'
    });

    var bonsaiPrizeA = buildPrizeA({
      name: 'take-prize',
      property: 'src',
      value: 'prizeImages/bonsai.png'
    });

    let takePrizesA = sushiPrizeA
      .fan(misoPrizeA)
      .fan(bonsaiPrizeA);

    function getTile(rank, file) {
      // if the tile is in our list, return it
      var i, length = game.tiles.length;
      for (i = 0; i < length; i += 1) {
        if (game.tiles[i].rank === rank && game.tiles[i].file === file) {
          return game.tiles[i];
        }
      }
      // otherwise push and return a default tile
      game.tiles.push({
        rank: rank,
        file: file,
        src: 'tileImages/grassField.png'
      });
      return game.tiles[game.tiles.length - 1];
    }

    // apply changes and return the restore information
    function applyChanges(game, changes) {
      let restore = [];

      changes.forEach((e) => {
        let tile = getTile(e.rank, e.file);
        restore.push({
          rank: e.rank,
          file: e.file,
          src: tile.src
        });
        tile.src = e.src;
      })

      game.server_setTiles(game.tiles);
      return restore;
    }

    // apply changes to the board and return the original tile values
    // the board is 'in' the closure of the returned function
    var boardTileChange = (x) => {
      let game = x.second.game;
      let changes = x.first;
      let changed = applyChanges(game, changes);
      return [changed, x.second];
    };

    // increase the size of the puddle
    var boardChanges = [{
        rank: 1,
        file: 10,
        src: "tileImages/water.png"
      },
      {
        rank: 1,
        file: 11,
        src: "tileImages/water.png"
      },
      {
        rank: 2,
        file: 9,
        src: "tileImages/water.png"
      },
      {
        rank: 2,
        file: 11,
        src: "tileImages/water.png"
      },
      {
        rank: 4,
        file: 9,
        src: "tileImages/water.png"
      },
      {
        rank: 4,
        file: 11,
        src: "tileImages/water.png"
      },
      {
        rank: 5,
        file: 10,
        src: "tileImages/water.png"
      },
      {
        rank: 5,
        file: 11,
        src: "tileImages/water.png"
      }
    ];

    // create a board tile changing arrow
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

    // example of using the second in the pair (pair.snd()) to flip the canTake state
    function flipCanTakeChest(x) {
      x.game.canTakeChest = !x.game.canTakeChest;
      return x;
    }

    function playerTookChest(x) {
      var canTake = x.game.canTakeChest;

      // check in case somehow someone already took it
      if (canTake) {
        // the sound of sweet success
        game.server_playSound({
          name: 'dahdahdah2.m4a',
          gain: 0.5
        });
      }

      // it's gone - no one can take it
      x.game.canTakeChest = false;
      return x;
    }

    function removePrize(x) {
      var eventData = x.first,
        game = x.second.game;
      game.server_removePrize(eventData);
      return x;
    }

    // create an arrow to handle chest and key behavior
    // note how the pair is used here
    var chestAndKeyA =
      constA(freeze({
        name: 'take-prize',
        property: 'src',
        value: 'prizeImages/Key.png'
      })).first
      // listen for the event of the user taking the key
      .then(eventPropertyA)
      // make the key go away
      .then(removePrize)
      // then flip the take chest flag - note the use of 'second()'
      .then(flipCanTakeChest.second)
      // then run either time running out or user taking the chest
      .then(
        // flip the take chest flag in 4 seconds
        lifta.delayA(4000).then(flipCanTakeChest.second)
        // or the user got the chest and process that
        .either(constA(freeze({
            name: 'take-prize',
            property: 'src',
            value: 'prizeImages/Chest-Closed.png'
          })).first
          .then(eventPropertyA)
          .then(removePrize)
          .then(playerTookChest.second)
        )
      );

    function startGameA(x) {
      x.second.clock.reset();
      x.second.clock.start();
      x.second.game.server_sendMessage('The game has started!');
      x.second.game.server_playSound({
        name: 'win.m4a',
        gain: 0.5
      });
      return x;
    }

    // fanout (run concurrently) the arrows we created
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

  // create io
  game.gameIo = createGameIo(io, id, game);

  // get data to the client to configure the game
  game.connected = function (socket) {
    socket.emit('board', {
      ranks: 20,
      files: 15,
      defaultImageURL: 'tileImages/grassField.png',
      prizes: game.prizes,
      pieces: game.pieces,
      tiles: game.tiles
    });

  };

  // handle incoming messages from client
  game.startGame = function (data) {
    console.log('user requested start game');
    createAndRunArrows();
    // send an object as a message or emit may not work!
    emitter.emit('start-game', {});
  };

  game.moveTo = function (data) {
    // can the user move here?
    console.log('user request move-to ', data);
    // did they land on a prize? increase points, remove prize, update points
    emitter.emit('request-move-to', data);
  };

  game.server_movePlayer = function (to) {
    game.gameIo.namespace.emit('set-pieces', [to]);
  };

  game.server_moveMonster = function (to) {
    game.gameIo.namespace.emit('set-pieces', [{
      name: 'monster',
      src: 'pieceImages/monster.png',
      rank: to.r,
      file: to.f
    }]);
  };

  game.server_setPoints = function (points) {
    game.gameIo.namespace.emit('set-points', points);
  };

  game.server_setCountdown = function (countdown) {
    game.gameIo.namespace.emit('set-countdown', countdown);
  };

  game.server_sendMessage = function (message) {
    game.gameIo.namespace.emit('text-message', message);
  };

  game.server_playSound = function (sound) {
    game.gameIo.namespace.emit('one-shot-sound', sound);
  };

  game.server_removePrize = function (prize) {
    game.gameIo.namespace.emit('remove-prizes', [prize]);
  };

  game.server_setTiles = function (tiles) {
    game.gameIo.namespace.emit('set-tiles', tiles);
  };

  return game;
}

app.get('/game1', function (req, res) {
  var socketId,
    socketListener,
    gameController;
  try {
    // this will be the game id
    socketId = '/game1_' + req.sessionID;

    createGame(socketId);

    //send the page across to the client
    res.render('game1', {
      title: "Game 1",
      game: socketId,
      hexTemplateCode: imghex.hexMapDivTemplate(),
      layout: false
    });

  } catch (e) {
    console.log(e);
  }
});

var server = http.createServer(app);
server.listen(app.get('port'), function () {
  console.log('Express server listening on port ' + app.get('port'));
});

var io = socketio.listen(server);
io.set('log level', 1);